@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto node_missing

if /i "%~1"=="--check" goto check_only

start "Project OS Local Server" /min cmd /c "node scripts\serve.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173"
endlocal
exit /b 0

:check_only
node scripts\serve.mjs --check
exit /b

:node_missing
echo [Project OS] Node.js was not found.
echo Install Node.js 20 LTS or newer, then run this file again.
pause
exit /b 1
