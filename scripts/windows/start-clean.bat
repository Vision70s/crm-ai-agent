@echo off
echo ================================================
echo  CRM AI Agent - Start Clean
echo ================================================
echo.
echo Step 1: Killing existing Node processes...
taskkill /F /IM node.exe 2>nul
if %errorlevel% equ 0 (
    echo [OK] Processes terminated
) else (
    echo [OK] No processes to kill
)

echo.
echo Step 2: Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo.
echo Step 3: Starting CRM AI Agent...
echo.
npm run dev
