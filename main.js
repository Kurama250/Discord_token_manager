const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const net = require('net');
const https = require('https');
const tar = require('tar');
const { spawn, exec } = require('child_process');

let mainWindow;
let isTorRunning = false;
let loadingWindow = null;

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
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    loadingWindow.loadFile('loading.html');
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
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    mainWindow.loadFile('index.html');
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

ipcMain.handle('auto-login', async (event, token) => {
    let browserWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: false,
            allowRunningInsecureContent: true,
            allowPasting: true,
        },
    });

    browserWindow.webContents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const session = browserWindow.webContents.session;
    await session.clearCache();
    await session.clearStorageData({ storages: ['cookies', 'localstorage', 'indexeddb', 'websql'] });

    browserWindow.loadURL('https://discord.com/login');

    browserWindow.webContents.once('did-finish-load', () => {
        browserWindow.webContents.executeJavaScript(`
            (function() {
                try {
                    function login(token) {
                        setInterval(() => {
                            document.body.appendChild(document.createElement('iframe')).contentWindow.localStorage.token = '"${token}"';
                        }, 50);

                        setTimeout(() => {
                            location.reload();
                        }, 2500);
                    }
                    login("${token}");
                } catch (error) {}
            })();
        `);
    });

    browserWindow.webContents.once('did-navigate', (event, url) => {
        if (url === 'https://discord.com/login') {
            setTimeout(() => {
                browserWindow.loadURL('https://discord.com/app');
            }, 3000);
        }
    });
});

ipcMain.handle('auto-login-proxied', async (event, token) => {
    const isTorActive = await checkIfTorIsRunning();

    if (!isTorActive) {
        dialog.showMessageBoxSync({
            type: 'error',
            title: 'Tor unavailable',
            message: 'The Tor service is not active or found. Please start it and try again.',
        });
        return;
    }

    const torSession = require('electron').session.fromPartition('persist:torSession');
    await torSession.setProxy({ proxyRules: 'socks5://127.0.0.1:9050', proxyBypassRules: 'localhost' });

    let browserWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            session: torSession,
        },
    });

    browserWindow.webContents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const session = browserWindow.webContents.session;
    await session.clearCache();
    await session.clearStorageData({ storages: ['cookies', 'localstorage', 'indexeddb', 'websql'] });

    browserWindow.loadURL('https://discord.com/login');

    browserWindow.webContents.once('did-finish-load', () => {
        browserWindow.webContents.executeJavaScript(`
            (function() {
                function login(token) {
                    setInterval(() => {
                        document.body.appendChild(document.createElement('iframe')).contentWindow.localStorage.token = '"${token}"';
                    }, 50);

                    setTimeout(() => {
                        location.reload();
                    }, 2500);
                }
                login("${token}");
            })();
        `);
    });

    browserWindow.webContents.once('did-navigate', (event, url) => {
        if (url === 'https://discord.com/login') {
            setTimeout(() => {
                browserWindow.loadURL('https://discord.com/app');
            }, 3000);
        }
    });
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