@echo off
echo ================================================
echo  CRM AI Agent - Process Status
echo ================================================
echo.
echo Checking for running Node.js processes...
echo.

tasklist /FI "IMAGENAME eq node.exe" /FO TABLE
if %errorlevel% equ 0 (
    echo.
    echo [INFO] Node.js processes found above
) else (
    echo [INFO] No Node.js processes running
)

echo.
echo To kill them, run: kill-bot.bat
echo.
pause
