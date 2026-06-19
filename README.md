# Discord Token Manager

<div align="center">

<img src="https://cdn.simpleicons.org/discord/5865F2" width="80" alt="Discord"/>

<br/><br/>

[![Status](https://img.shields.io/badge/Status-Stable-brightgreen?style=for-the-badge)](.)
[![Version](https://img.shields.io/badge/Version-3.4.0-blue?style=for-the-badge)](.)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](.)
[![Electron](https://img.shields.io/badge/Electron-33-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-≥18-339933?style=for-the-badge&logo=node.js&logoColor=white)](.)
[![License: CC BY-NC-ND 4.0](https://img.shields.io/badge/License-CC%20BY--NC--ND%204.0-lightgrey?style=for-the-badge)](https://creativecommons.org/licenses/by-nc-nd/4.0/)

[![Stars](https://img.shields.io/github/stars/Kurama250/Discord_token_manager?style=flat-square)](https://github.com/Kurama250/Discord_token_manager/stargazers)
[![Repo size](https://img.shields.io/github/repo-size/Kurama250/Discord_token_manager?style=flat-square)](https://github.com/Kurama250/Discord_token_manager)
[![fs-extra](https://img.shields.io/npm/v/fs-extra?label=fs-extra&style=flat-square)](https://www.npmjs.com/package/fs-extra)
[![electron-builder](https://img.shields.io/npm/v/electron-builder?label=electron-builder&style=flat-square)](https://www.npmjs.com/package/electron-builder)

## Licence

This project is distributed under **Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International (CC BY-NC-ND 4.0)**.  
See the [full license](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.en) for details.

<br/>

> **Pre-built installer available in [Releases](https://github.com/Kurama250/Discord_token_manager/releases)** — no need to compile from source.

</div>

---

<div align="center">

## Overview

**Discord Token Manager** is a Windows desktop application built with **Electron** that lets you store, manage and connect Discord accounts via token — with optional **Tor routing** per account, persistent sessions, and an integrated Discord web client.

</div>

---

<div align="center">

## Demo

<p align="center">
  <img src="https://github.com/Kurama250/Discord_token_manager/blob/main/app.png" alt="Discord Token Manager Demo">
</p>

</div>

---

<div align="center">

## Features

### ![Token Management](https://img.shields.io/badge/🔑_Token_Management-5865F2?style=flat-square)

| Feature | Description |
|---|---|
| Add / Edit / Delete | Manage multiple accounts from a single interface |
| Copy | Copy name + token to clipboard in one click |
| Persistent storage | Tokens saved locally in `%AppData%` |
| Per-account Tor | Enable or disable SOCKS5 proxy individually |

---

### ![Discord Login](https://img.shields.io/badge/🚀_Auto_Login-57F287?style=flat-square)

| Feature | Description |
|---|---|
| One-click Connect | Opens Discord in an isolated Electron window |
| Token injection | Automatic login without manual credentials |
| Session persistence | Each account keeps its own browser partition |
| WebAuthn block | Prevents Windows passkey popups on login |

---

### ![Tor Proxy](https://img.shields.io/badge/onion_Tor_Proxy-7D4698?style=flat-square)

| Feature | Description |
|---|---|
| Auto-install | Downloads and extracts Tor Expert Bundle on first launch |
| SOCKS5 `127.0.0.1:9050` | Routes Discord traffic through Tor when enabled |
| Per-account sessions | Separate Tor partition per token index |
| Start / Stop | Tor lifecycle managed from the main process |

> Tor is downloaded automatically. Manual bundle: [Tor Expert Bundle 13.5.6](https://archive.torproject.org/tor-package-archive/torbrowser/13.5.6/tor-expert-bundle-windows-x86_64-13.5.6.tar.gz)

---

### ![Screen Share](https://img.shields.io/badge/🖥️_Screen_Share-EB459E?style=flat-square)

| Feature | Description |
|---|---|
| Custom picker | Native screen/window selector for Discord streaming |
| Display media handler | `setDisplayMediaRequestHandler` for Electron compatibility |
| WGC fallback | Legacy capturer on Windows for better stability |
| Permissions | Media & display-capture auto-granted in Discord sessions |

---

### ![UI & Theme](https://img.shields.io/badge/🎨_UI_&_Theme-FEE75C?style=flat-square)

| Feature | Description |
|---|---|
| Light / Dark mode | Toggle theme from the title bar |
| Frameless window | Custom title bar with minimize & close |
| Loading screen | Progress UI during Tor installation |

</div>

---

## How It Works

```
Add token in manager
        ↓
Click Connect (Tor optional)
        ↓
Isolated Electron session opens
        ↓
Token injected → Discord /channels
        ↓
Persistent session on next launch
```

---

## Requirements

| Requirement | Details |
|---|---|
| OS | **Windows 10/11** (x64) |
| Node.js | `>= 18.0.0` (for development only) |
| Tor | Auto-installed on first run (or manual bundle) |
| RAM | ~300 MB minimum |

> **Note:** If you check your connection region in Discord device settings, the displayed location may not update immediately — this is normal Discord behavior.

---

## Setup

### A) Installer (recommended)

1. Download **`Discord_token_manager_setup.exe`** from [Releases](https://github.com/Kurama250/Discord_token_manager/releases)
2. Run the installer
3. Launch the app from the Start menu

### B) From source

```bash
git clone https://github.com/Kurama250/Discord_token_manager.git
cd Discord_token_manager
npm install
npm start
```

### C) Build executable

```bash
npm install
npm run build
```

Output:

| File | Path |
|---|---|
| Installer | `dist/Discord_token_manager Setup 3.4.0.exe` |
| Portable | `dist/win-unpacked/Discord_token_manager.exe` |

---

## Scripts

| Command | Description |
|---|---|
| `npm start` | Launch the app in development mode |
| `npm run build` | Package Windows NSIS installer + portable build |
| `npm install` | Install dependencies |

---

## Project Structure

```
Discord_token_manager/
├── src/
│   ├── main.js                 # Electron main process (Tor, Discord, IPC)
│   └── preload/
│       └── discord-preload.js  # WebAuthn blocker for Discord windows
├── views/
│   ├── index.html              # Main UI
│   ├── loading.html            # Tor installation screen
│   └── screen-picker.html      # Screen share selector
├── assets/
│   ├── css/                    # Light & dark themes
│   ├── img/                    # App icon
│   └── js/
│       └── script.js           # Renderer logic
├── package.json
└── README.md
```

---

## Startup Preview

```
╔══════════════════════════════════════════════════════════╗
║   💬  DISCORD TOKEN MANAGER  v3.4.0                     ║
║   Multi-account · Tor proxy · Screen share              ║
╠══════════════════════════════════════════════════════════╣
║  ● TOR CHECK                                             ║
║  Auto-install    Enabled                                 ║
║  SOCKS5          127.0.0.1:9050                          ║
║  Sessions        Per-account partitions                  ║
╠══════════════════════════════════════════════════════════╣
║  Made by Kurama250 → github.com/Kurama250                ║
╚══════════════════════════════════════════════════════════╝
```

---

<div align="center">

## Support

<a href="https://discord.gg/6aebQGdDxB" title="Join Discord Support">
  <img src="https://cdn.simpleicons.org/discord/5865F2" width="56" alt="Discord Support"/>
</a>

<br/>

Create a ticket with the bot for help.

<br/>

If you like this repository don't hesitate to give it a star ⭐ !

</div>

---

<div align="center">

## Developer

[![Kurama250](https://img.shields.io/badge/Main%20Dev-Kurama250-orange?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Kurama250)

---

*Discord Token Manager — Manage and connect your Discord accounts with optional Tor routing*

</div>
