/**
Licence : Creative commons - CC BY-NC-ND 4.0 by github.com/Kurama250
*/

const { ipcRenderer } = require('electron');
const maxLength = 20;
let tokensCache = [];

document.getElementById('minimize-btn').addEventListener('click', () => {
    ipcRenderer.send('minimize-app');
});

document.getElementById('close-btn').addEventListener('click', () => {
    ipcRenderer.send('close-app');
});

async function loadTokens() {
    tokensCache = await ipcRenderer.invoke('get-tokens');
    renderTable(tokensCache);
}

function renderTable(tokens) {
    const tableBody = document.querySelector('#tokens-table tbody');

    tableBody.innerHTML = '';

    tokens.forEach((token, index) => {
        const displayName = token.name.length > maxLength ? token.name.slice(0, maxLength) + '...' : token.name;
        const displayToken = token.token.length > maxLength ? token.token.slice(0, maxLength) + '...' : token.token;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${displayName}</td>
            <td>${displayToken}</td>
            <td class="actions">
                <button data-action="edit" data-index="${index}" class="edit-btn">Edit</button>
                <button data-action="delete" data-index="${index}" class="delete-btn">Delete</button>
                <button data-action="connect" data-index="${index}" class="connect-btn">Connect</button>
                <button data-action="copy" data-index="${index}" class="copy-btn">Copy</button>
                <button data-action="toggle-tor" data-index="${index}" class="tor-btn ${token.torEnabled ? 'tor-enabled' : 'tor-disabled'}">
                    ${token.torEnabled ? 'Disable Tor' : 'Enable Tor'}
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    attachEventListenersToButtons();
}

function attachEventListenersToButtons() {
    const tableBody = document.querySelector('#tokens-table tbody');
    tableBody.removeEventListener('click', handleButtonClick);
    tableBody.addEventListener('click', handleButtonClick);
}

async function handleButtonClick(e) {
    const action = e.target.dataset.action;
    const index = parseInt(e.target.dataset.index, 10);

    if (action === 'edit') {
        const token = tokensCache[index];
        openEditModal(token.name, token.token, index);
    }

    if (action === 'delete') {
        if (confirm('Are you sure you want to delete this token?')) {
            tokensCache.splice(index, 1);
            renderTable(tokensCache);
            await ipcRenderer.invoke('delete-token', index);
            ipcRenderer.send('focus-fix');
        } else {
            ipcRenderer.send('focus-fix');
        }
    }

    if (action === 'connect') {
        const token = tokensCache[index].token;
        const torEnabled = tokensCache[index].torEnabled;

        if (torEnabled) {
            ipcRenderer.invoke('auto-login-proxied', token);
        } else {
            ipcRenderer.invoke('auto-login', token);
        }
    }

    if (action === 'copy') {
        copyTokenToClipboard(index);
    }

    if (action === 'toggle-tor') {
        toggleTorStatus(index, e.target);
    }
}

async function toggleTorStatus(index, button) {
    const enable = button.textContent === 'Enable Tor';
    const result = await ipcRenderer.invoke('toggle-tor', { index, enable });

    if (result.success) {
        tokensCache[index].torEnabled = enable;
        button.textContent = enable ? 'Disable Tor' : 'Enable Tor';
        button.classList.toggle('tor-enabled', enable);
        button.classList.toggle('tor-disabled', !enable);
        
        if (!enable) {
            const session = require('electron').session.fromPartition('persist:torSession');
            await session.setProxy({ proxyRules: '' });
        }

        ipcRenderer.send('focus-fix');
    } else {
        alert('Error: ' + result.error);
        ipcRenderer.send('focus-fix');
    }
}

function copyTokenToClipboard(index) {
    const token = tokensCache[index];
    const textToCopy = `Name: ${token.name}\nToken: ${token.token}`;

    navigator.clipboard.writeText(textToCopy)
        .then(() => {
            alert('Name and Token copied to clipboard!');
            ipcRenderer.send('focus-fix');
        })
        .catch(err => console.error('Error copying: ', err));
}

document.getElementById('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const token = document.getElementById('token').value.trim();

    if (name && token) {
        tokensCache.push({ name, token, torEnabled: false });
        renderTable(tokensCache);
        await ipcRenderer.invoke('add-token', { name, token });

        document.getElementById('name').value = '';
        document.getElementById('token').value = '';
    }
});

function openEditModal(name, token, index) {
    const modal = document.getElementById('edit-modal');
    const overlay = document.getElementById('popup-overlay');

    document.getElementById('edit-name').value = name;
    document.getElementById('edit-token').value = token;

    overlay.style.display = 'block';
    modal.style.display = 'block';

    document.getElementById('edit-form').onsubmit = async (e) => {
        e.preventDefault();
        const newName = document.getElementById('edit-name').value.trim();
        const newToken = document.getElementById('edit-token').value.trim();

        if (newName && newToken) {
            tokensCache[index] = { name: newName, token: newToken };
            renderTable(tokensCache);
            await ipcRenderer.invoke('edit-token', { index, name: newName, token: newToken });
            closeModal();
        }
    };
}

function closeModal() {
    const modal = document.getElementById('edit-modal');
    const overlay = document.getElementById('popup-overlay');
    overlay.style.display = 'none';
    modal.style.display = 'none';
}

document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('popup-overlay').addEventListener('click', closeModal);

loadTokens();

document.addEventListener("DOMContentLoaded", () => {
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    const themeStylesheet = document.getElementById("theme-stylesheet");

    const savedTheme = localStorage.getItem("theme") || "clair";
    themeStylesheet.href = `assets/css/styles-${savedTheme}.css`;
    updateButtonText(savedTheme);
  
    themeToggleBtn.addEventListener("click", () => {
      const currentTheme = themeStylesheet.href.includes("styles-clair") ? "sombre" : "clair";
      themeStylesheet.href = `assets/css/styles-${currentTheme}.css`;
      localStorage.setItem("theme", currentTheme);
      updateButtonText(currentTheme);
    });
  
    function updateButtonText(theme) {
      themeToggleBtn.textContent = theme === "clair" ? "🌞" : "🌙";
    }
});
