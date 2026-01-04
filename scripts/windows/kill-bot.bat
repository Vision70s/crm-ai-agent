@echo off
echo ================================================
echo  CRM AI Agent - Kill All Node Processes
echo ================================================
echo.
echo This will terminate ALL Node.js processes
echo.
pause

taskkill /F /IM node.exe 2>nul
if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] All Node.js processes terminated
) else (
    echo.
    echo [INFO] No Node.js processes found
)

echo.
pause
