const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, nativeImage } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const net = require('net');
const https = require('https');
const tar = require('tar');
const { spawn, exec } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const VIEWS_DIR = path.join(ROOT_DIR, 'views');
const PRELOAD_PATH = path.join(__dirname, 'preload', 'discord-preload.js');
const APP_ICON_PATH = path.join(ROOT_DIR, 'assets', 'img', 'app-icon.ico');

const getAppIcon = () => {
    if (fs.existsSync(APP_ICON_PATH)) {
        return nativeImage.createFromPath(APP_ICON_PATH);
    }
    return undefined;
};

if (process.platform === 'win32') {
    app.setAppUserModelId('kurama.info.discord-token-manager');
}

const DISABLED_FEATURES = [
    'WebAuthentication',
    'WebAuthenticationConditionalUI',
    'WebIdentityDigitalCredentials',
    'WebAuthenticationCableSecondFactor',
    'WebAuthenticationAndroidCredMan',
];

if (process.platform === 'win32') {
    DISABLED_FEATURES.push(
        'WebRtcAllowWgcDesktopCapturer',
        'WebRtcAllowWgcScreenCapturer',
        'WebRtcAllowWgcWindowCapturer',
        'WebRtcAllowWgcScreenZeroHz',
        'WebRtcAllowWgcZeroHz'
    );
}

app.commandLine.appendSwitch('disable-features', DISABLED_FEATURES.join(','));
app.commandLine.appendSwitch('disable-blink-features', 'WebAuthentication');

let mainWindow;
let isTorRunning = false;
let loadingWindow = null;
let pickerWindow = null;
let pickerSources = [];
let displayMediaCallback = null;
let pickerConfirmed = false;

const closeScreenPicker = () => {
    if (pickerWindow && !pickerWindow.isDestroyed()) {
        pickerWindow.close();
    }
    pickerWindow = null;
};

const filterCaptureSources = (sources) => {
    return sources.filter((source) => source.name && source.id);
};

const fetchCaptureSources = async () => {
    const noThumbnail = { width: 0, height: 0 };
    const [screens, windows] = await Promise.all([
        desktopCapturer.getSources({ types: ['screen'], thumbnailSize: noThumbnail }),
        desktopCapturer.getSources({ types: ['window'], thumbnailSize: noThumbnail, fetchWindowIcons: false }),
    ]);
    return filterCaptureSources([...screens, ...windows]);
};

const completeDisplayMedia = async (sourceId) => {
    const callback = displayMediaCallback;
    displayMediaCallback = null;

    if (!callback) return;

    if (!sourceId) {
        callback({});
        return;
    }

    try {
        const sources = await fetchCaptureSources();
        const source = sources.find((s) => s.id === sourceId);
        if (!source) {
            callback({});
            return;
        }
        callback({ video: source });
    } catch (error) {
        console.error('Display media callback error:', error);
        callback({});
    }
};

const showScreenPicker = async (parentWindow) => {
    pickerSources = await fetchCaptureSources();

    if (!pickerSources.length) {
        return null;
    }

    if (pickerSources.length === 1) {
        return pickerSources[0].id;
    }

    return new Promise((resolve) => {
        let settled = false;

        const finish = (sourceId) => {
            if (settled) return;
            settled = true;
            pickerConfirmed = true;
            ipcMain.removeListener('screen-picker-select', onSelect);
            ipcMain.removeListener('screen-picker-cancel', onCancel);
            closeScreenPicker();
            resolve(sourceId);
        };

        const onSelect = (_event, sourceId) => finish(sourceId);
        const onCancel = () => finish(null);

        ipcMain.on('screen-picker-select', onSelect);
        ipcMain.on('screen-picker-cancel', onCancel);

        pickerConfirmed = false;
        pickerWindow = new BrowserWindow({
            width: 720,
            height: 560,
            parent: parentWindow || undefined,
            modal: false,
            alwaysOnTop: true,
            resizable: false,
            title: 'Partager l\'écran',
            autoHideMenuBar: true,
            icon: getAppIcon(),
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            },
        });

        pickerWindow.loadFile(path.join(VIEWS_DIR, 'screen-picker.html'));

        pickerWindow.on('closed', () => {
            pickerWindow = null;
            if (!settled) {
                finish(null);
            }
            pickerConfirmed = false;
        });
    });
};

ipcMain.handle('screen-picker-sources', () => {
    return pickerSources.map((source) => {
        const hasThumb = source.thumbnail
            && typeof source.thumbnail.isEmpty === 'function'
            && !source.thumbnail.isEmpty();
        return {
            id: source.id,
            name: source.name,
            type: source.id.startsWith('screen:') ? 'screen' : 'window',
            thumbnailURL: hasThumb ? source.thumbnail.toDataURL() : null,
        };
    });
});

const TOR_DOWNLOAD_URL = 'https://archive.torproject.org/tor-package-archive/torbrowser/13.5.6/tor-expert-bundle-windows-x86_64-13.5.6.tar.gz';
const DOWNLOAD_PATH = path.join(app.getPath('userData'), 'tor.tar.gz');
const EXTRACT_DIR = path.join(app.getPath('userData'), 'tor');
const TOR_EXECUTABLE = path.join(EXTRACT_DIR, 'tor', 'tor.exe');

const userDataPath = app.getPath('userData');
const tokensPath = path.join(userDataPath, 'tokens');
const tokensFile = path.join(tokensPath, 'tokens.json');
const settingsPath = path.join(userDataPath, 'settings');
const saveFile = path.join(settingsPath, 'theme.json');

const createLoadingWindow = () => {
    loadingWindow = new BrowserWindow({
        width: 400,
        height: 200,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        icon: getAppIcon(),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    loadingWindow.loadFile(path.join(VIEWS_DIR, 'loading.html'));
    return loadingWindow;
};

const closeLoadingWindow = () => {
    if (loadingWindow) {
        loadingWindow.close();
        loadingWindow = null;
    }
};

const updateLoadingProgress = (message, progress = null) => {
    if (loadingWindow) {
        loadingWindow.webContents.send('update-progress', { message, progress });
    }
};

const checkIfTorIsRunning = () => {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(3000);
        socket.on('connect', () => {
            socket.end();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            reject('Tor port is inactive');
        });
        socket.on('error', (err) => {
            reject('Error connecting to Tor port : ' + err.message);
        });
        socket.connect(9050, '127.0.0.1');
    });
};

const downloadTor = () => {
    return new Promise((resolve, reject) => {
        console.log('Downloading Tor...');
        updateLoadingProgress('Téléchargement de Tor...', 0);
        
        const file = fs.createWriteStream(DOWNLOAD_PATH);
        
        https.get(TOR_DOWNLOAD_URL, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download Tor: ${response.statusCode}`));
                return;
            }
            
            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            
            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                if (totalSize) {
                    const progress = Math.round((downloadedSize / totalSize) * 100);
                    updateLoadingProgress(`Téléchargement de Tor... ${progress}%`, progress);
                }
            });
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log('Tor download completed');
                updateLoadingProgress('Téléchargement terminé', 100);
                resolve();
            });
            
            file.on('error', (err) => {
                fs.unlink(DOWNLOAD_PATH, () => {});
                reject(err);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
};

const extractTor = () => {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Extracting Tor...');
            updateLoadingProgress('Extraction de Tor...', 0);
            
            await fs.ensureDir(EXTRACT_DIR);
            await tar.extract({
                file: DOWNLOAD_PATH,
                cwd: EXTRACT_DIR
            });
            
            updateLoadingProgress('Extraction terminée', 50);
            
            await fs.remove(DOWNLOAD_PATH);
            console.log('Tor extraction completed');
            updateLoadingProgress('Installation terminée', 100);
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};

const ensureTorInstalled = async () => {
    try {
        if (await fs.pathExists(TOR_EXECUTABLE)) {
            console.log('Tor is already installed');
            return true;
        }
        
        createLoadingWindow();
        updateLoadingProgress('Checking Tor installation...', 0);
        
        await downloadTor();
        await extractTor();
        
        if (await fs.pathExists(TOR_EXECUTABLE)) {
            console.log('Tor installation completed successfully');
            updateLoadingProgress('Installation successful!', 100);
            
            setTimeout(() => {
                closeLoadingWindow();
            }, 1500);
            
            return true;
        } else {
            throw new Error('Tor executable not found after installation');
        }
    } catch (error) {
        console.error('Error installing Tor:', error);
        updateLoadingProgress('Installation error', 0);
        
        setTimeout(() => {
            closeLoadingWindow();
        }, 2000);
        
        return false;
    }
};

app.on('ready', async () => {
    try {
        await ensureTorInstalled();
        
        if (!(await fs.pathExists(TOR_EXECUTABLE))) {
            console.log('Tor installation failed');
            isTorRunning = false;
        } else {
            const torProcess = spawn(TOR_EXECUTABLE, ['--SocksPort', '9050'], {
                detached: true,
                stdio: 'ignore'
            });

            await new Promise(resolve => setTimeout(resolve, 5000));

            try {
                await checkIfTorIsRunning();
                isTorRunning = true;
                console.log('Tor started successfully on app launch');
            } catch (error) {
                isTorRunning = false;
                console.log('Failed to start Tor on app launch:', error);
            }
        }
    } catch (err) {
        isTorRunning = false;
        console.log('Error during Tor startup:', err);
    }

    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 400,
        frame: false,
        transparent: true,
        resizable: true,
        hasShadow: false,
        icon: getAppIcon(),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    mainWindow.loadFile(path.join(VIEWS_DIR, 'index.html'));
});

ipcMain.on('minimize-app', () => {
    mainWindow.minimize();
});

ipcMain.on('close-app', () => {
    mainWindow.close();
});

ipcMain.on('focus-fix', () => {
    mainWindow.blur();
    mainWindow.focus();
});

ipcMain.handle('get-tokens', async () => {
    try {
        if (!await fs.pathExists(tokensFile)) {
            return [];
        }
        return await fs.readJson(tokensFile);
    } catch (error) {
        console.error("Error reading tokens :", error.message);
        return [];
    }
});

ipcMain.handle('add-token', async (event, { name, token }) => {
    try {
        if (!name || !token) throw new Error("Name and token are required.");

        if (!(await fs.pathExists(tokensFile))) {
            await fs.ensureDir(tokensPath);
            await fs.writeJson(tokensFile, []);
        }

        const tokens = await fs.readJson(tokensFile);
        tokens.push({ name, token, torEnabled: false });
        await fs.writeJson(tokensFile, tokens);
        return { success: true, tokens };
    } catch (error) {
        console.error("Error adding token :", error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('edit-token', async (event, { index, name, token }) => {
    try {
        const tokens = await fs.readJson(tokensFile);
        if (index >= 0 && index < tokens.length) {
            tokens[index] = { name, token, torEnabled: tokens[index].torEnabled };
            await fs.writeJson(tokensFile, tokens);
        }
        return tokens;
    } catch (error) {
        console.error("Error editing token :", error.message);
        return [];
    }
});

ipcMain.handle('delete-token', async (event, index) => {
    try {
        const tokens = await fs.readJson(tokensFile);
        if (index >= 0 && index < tokens.length) {
            tokens.splice(index, 1);
            await fs.writeJson(tokensFile, tokens);
        }
        return tokens;
    } catch (error) {
        console.error("Error deleting token :", error.message);
        return [];
    }
});

ipcMain.handle('toggle-tor', async (event, { index, enable }) => {
    try {
        const tokens = await fs.readJson(tokensFile);
        if (index >= 0 && index < tokens.length) {
            tokens[index].torEnabled = enable;
            await fs.writeJson(tokensFile, tokens);
            return { success: true };
        }
        return { success: false, error: "Invalid index" };
    } catch (error) {
        console.error("Error enabling Tor :", error.message);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('start-tor', async () => {
    try {
        if (isTorRunning) {
            return { success: true, message: 'Tor is already running' };
        }

        if (!(await fs.pathExists(TOR_EXECUTABLE))) {
            createLoadingWindow();
            updateLoadingProgress('Tor installation required...', 0);
            
            const installed = await ensureTorInstalled();
            if (!installed) {
                closeLoadingWindow();
                return { success: false, error: 'Failed to install Tor' };
            }
        }

        const torProcess = spawn(TOR_EXECUTABLE, ['--SocksPort', '9050'], {
            detached: true,
            stdio: 'ignore'
        });

        await new Promise(resolve => setTimeout(resolve, 3000));

        try {
            await checkIfTorIsRunning();
            isTorRunning = true;
            return { success: true, message: 'Tor started successfully' };
        } catch (error) {
            return { success: false, error: 'Failed to start Tor: ' + error };
        }
    } catch (error) {
        console.error('Error starting Tor:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('stop-tor', async () => {
    try {
        if (!isTorRunning) {
            return { success: true, message: 'Tor is not running' };
        }

        exec('taskkill /f /im tor.exe', (error) => {
            if (error) {
                console.error('Error stopping Tor:', error);
            }
        });

        isTorRunning = false;
        return { success: true, message: 'Tor stopped successfully' };
    } catch (error) {
        console.error('Error stopping Tor:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-tor-status', async () => {
    try {
        const installed = await fs.pathExists(TOR_EXECUTABLE);
        const running = await checkIfTorIsRunning().then(() => true).catch(() => false);
        return { installed, running };
    } catch (error) {
        console.error('Error getting Tor status:', error);
        return { installed: false, running: false };
    }
});

const DISCORD_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const getDiscordPartition = (index) => `persist:discord-account-${index}`;

const WEBAUTHN_BLOCK_SCRIPT = `(function(){const deny=()=>Promise.reject(new DOMException('Aborted','AbortError'));try{Object.defineProperty(navigator,'credentials',{value:{create:deny,get:deny,store:deny,preventSilentAccess:()=>Promise.resolve()},writable:false,configurable:true});}catch(e){}try{window.PublicKeyCredential=class{static isUserVerifyingPlatformAuthenticatorAvailable(){return Promise.resolve(false)}static isConditionalMediationAvailable(){return Promise.resolve(false)}};}catch(e){}})();`;

const setupDiscordSession = (session) => {
    session.setPermissionRequestHandler((_webContents, _permission, callback) => {
        callback(true);
    });

    session.setPermissionCheckHandler(() => true);

    session.setDisplayMediaRequestHandler(async (request, callback) => {
        displayMediaCallback = callback;

        try {
            const parentWindow = BrowserWindow.getFocusedWindow()
                || BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());

            const sourceId = await showScreenPicker(parentWindow);
            await completeDisplayMedia(sourceId);
        } catch (error) {
            console.error('Screen share error:', error);
            await completeDisplayMedia(null);
        }
    }, { useSystemPicker: false });
};

const buildTokenLoginScript = (token) => `
    (function() {
        const t = ${JSON.stringify(token)};
        const iv = setInterval(function() {
            try {
                const f = document.createElement('iframe');
                document.body.appendChild(f);
                f.contentWindow.localStorage.setItem('token', JSON.stringify(t));
            } catch (e) {}
        }, 50);
        setTimeout(function() {
            clearInterval(iv);
            window.location.href = 'https://discord.com/channels/@me';
        }, 2500);
    })();
`;

const safeExec = (webContents, script) => {
    if (webContents.isDestroyed()) return;
    webContents.executeJavaScript(script).catch(() => {});
};

const injectDiscordToken = (webContents, token) => {
    safeExec(webContents, WEBAUTHN_BLOCK_SCRIPT);
    safeExec(webContents, buildTokenLoginScript(token));
};

const applyDiscordStealth = (webContents) => {
    webContents.on('dom-ready', () => {
        safeExec(webContents, `
            (function() {
                try {
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                    if (!window.chrome) window.chrome = { runtime: {} };
                } catch (e) {}
            })();
        `);
    });
};

const openDiscordWindow = async ({ token, index, torSession = null }) => {
    const partition = getDiscordPartition(index);
    const session = torSession || require('electron').session.fromPartition(partition);

    setupDiscordSession(session);

    const browserWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        show: true,
        icon: getAppIcon(),
        webPreferences: {
            session,
            nodeIntegration: false,
            contextIsolation: true,
            preload: PRELOAD_PATH,
            backgroundThrottling: false,
            enableBlinkFeatures: 'EnumerateDevices,AudioOutputDevices',
        },
    });

    browserWindow.webContents.setUserAgent(DISCORD_USER_AGENT);
    applyDiscordStealth(browserWindow.webContents);

    const { webContents } = browserWindow;
    let tokenInjected = false;

    const tryInjectToken = () => {
        if (webContents.isDestroyed()) return;
        const url = webContents.getURL();
        const onLogin = url.includes('discord.com/login') || url.includes('discord.com/register');
        if (!tokenInjected && onLogin) {
            tokenInjected = true;
            injectDiscordToken(webContents, token);
        }
    };

    webContents.on('did-start-navigation', () => {
        safeExec(webContents, WEBAUTHN_BLOCK_SCRIPT);
    });

    webContents.on('dom-ready', tryInjectToken);
    webContents.on('did-finish-load', tryInjectToken);

    webContents.loadURL('https://discord.com/login');
};

ipcMain.handle('auto-login', async (_event, payload) => {
    try {
        const { token, index } = typeof payload === 'string' ? { token: payload, index: 0 } : payload;
        if (!token || index === undefined || index === null) return { success: false, error: 'Token ou index manquant' };
        await openDiscordWindow({ token, index });
        return { success: true };
    } catch (error) {
        console.error('auto-login error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('auto-login-proxied', async (_event, payload) => {
    try {
        const { token, index } = typeof payload === 'string' ? { token: payload, index: 0 } : payload;
        if (!token || index === undefined || index === null) return { success: false, error: 'Token ou index manquant' };

        const isTorActive = await checkIfTorIsRunning();

        if (!isTorActive) {
            dialog.showMessageBoxSync({
                type: 'error',
                title: 'Tor unavailable',
                message: 'The Tor service is not active or found. Please start it and try again.',
            });
            return { success: false, error: 'Tor inactive' };
        }

        const torSession = require('electron').session.fromPartition(`${getDiscordPartition(index)}-tor`);
        await torSession.setProxy({ proxyRules: 'socks5://127.0.0.1:9050', proxyBypassRules: 'localhost' });

        await openDiscordWindow({ token, index, torSession });
        return { success: true };
    } catch (error) {
        console.error('auto-login-proxied error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-theme', async () => {
    try {
        if (!await fs.pathExists(saveFile)) {
            return { theme: 'light' };
        }
        return await fs.readJson(saveFile);
    } catch (error) {
        console.error("Error reading theme:", error.message);
        return { theme: 'light' };
    }
});

ipcMain.handle('save-theme', async (event, theme) => {
    try {
        if (!(await fs.pathExists(settingsPath))) {
            await fs.ensureDir(settingsPath);
        }
        await fs.writeJson(saveFile, { theme });
        return { success: true };
    } catch (error) {
        console.error("Error saving theme:", error.message);
        return { success: false, error: error.message };
    }
});