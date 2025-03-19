/**
Licence : Creative commons - CC BY-NC-ND 4.0 by github.com/Kurama250
*/

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const net = require('net');

let mainWindow;
let isTorRunning = false;

const userDataPath = app.getPath('userData');
const tokensPath = path.join(userDataPath, 'tokens');
const tokensFile = path.join(tokensPath, 'tokens.json');

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

app.on('ready', async () => {
    try {
        await checkIfTorIsRunning();
        isTorRunning = true;
    } catch (err) {
        isTorRunning = false;
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