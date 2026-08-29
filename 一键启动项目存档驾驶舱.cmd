@echo off
setlocal EnableExtensions
chcp 65001 >nul

cd /d "%~dp0"
set "PROJECT_DIR=%CD%"
set "APP_URL=http://127.0.0.1:4173"
set "NODE_EXE="

if not exist "%PROJECT_DIR%\scripts\serve.mjs" goto project_missing

call :check_server
if not errorlevel 1 goto open_app
if errorlevel 2 goto port_conflict

for %%N in (node.exe) do set "NODE_EXE=%%~$PATH:N"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
if not defined NODE_EXE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not defined NODE_EXE for /f "delims=" %%N in ('dir /b /s "%USERPROFILE%\.cache\codex-runtimes\*\dependencies\node\bin\node.exe" 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%N"
if not defined NODE_EXE goto node_missing

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "$logDir=Join-Path $env:LOCALAPPDATA 'TaskCockpit'; New-Item -ItemType Directory -Path $logDir -Force | Out-Null; Start-Process -FilePath '%NODE_EXE%' -ArgumentList 'scripts\serve.mjs' -WorkingDirectory '%PROJECT_DIR%' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')"

for /l %%T in (1,1,20) do (
  timeout /t 1 /nobreak >nul
  call :check_server
  if not errorlevel 1 goto open_app
  if errorlevel 2 goto port_conflict
)
goto start_failed

:open_app
start "" "%APP_URL%"
endlocal
exit /b 0

:check_server
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $response=Invoke-WebRequest -UseBasicParsing -Uri '%APP_URL%' -TimeoutSec 2; if ($response.StatusCode -eq 200 -and $response.Content -match 'Project OS') { exit 0 }; exit 2 } catch { exit 1 }"
exit /b %errorlevel%

:project_missing
echo [TaskCockpit] Project files were not found at:
echo %PROJECT_DIR%
pause
exit /b 1

:node_missing
echo [TaskCockpit] Node.js was not found.
echo Install Node.js 20 or start Codex once, then try again.
pause
exit /b 1

:port_conflict
echo [TaskCockpit] Port 4173 is being used by another application.
echo Close that application and double-click this launcher again.
pause
exit /b 1

:start_failed
echo [TaskCockpit] The local service did not become ready.
echo Logs: %LOCALAPPDATA%\TaskCockpit
pause
exit /b 1
