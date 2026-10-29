@echo off
rem Mitchell's Working Tool command-line launcher (builds dist if missing)
cd /d "%~dp0.."
if exist "releases\Mitchells-Working-Tool-0.13.0-win32-x64\Mitchells Working Tool.exe" (
  start "" "releases\Mitchells-Working-Tool-0.13.0-win32-x64\Mitchells Working Tool.exe"
  exit /b
)
rem Prefer node already on PATH; fall back to a local install (adjust if needed)
where node >nul 2>nul
if errorlevel 1 if exist "E:\node\node.exe" set "PATH=E:\node;C:\Windows\System32;%PATH%"
if not exist "dist\index.html" (
  call npm run build
)
npx electron desktop/main.mjs > "%TEMP%\chrona-start.log" 2>&1
