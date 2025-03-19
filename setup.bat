@echo off

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed on your system. Please install Node.js.
    exit /b 1
)

npm list fs-extra net user-agents electron electron-builder >nul 2>&1
if %errorlevel% neq 0 (
    echo fs-extra net user-agents electron electron-builder module is not installed. Installing them...
    npm install fs-extra@11.2.0 net@1.0.2 electron@33.2.1 electron-builder@25.1.8
    if %errorlevel% equ 0 (
        echo Installation of fs-extra net user-agents electron electron-builder completed successfully !
    ) else (
        echo An error occurred while installing the fs-extra net electron electron-builder modules.
    )
) else (
    echo fs-extra net user-agents electron electron-builder modules are already installed.
)

echo All necessary components are installed.
echo You can now proceed with your tasks.

pause
