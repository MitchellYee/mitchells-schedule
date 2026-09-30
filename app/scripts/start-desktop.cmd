@echo off
rem Mitchell's Schedule command-line launcher (builds dist if missing)
cd /d "%~dp0.."
rem Prefer node already on PATH; fall back to a local install (adjust if needed)
where node >nul 2>nul
if errorlevel 1 if exist "E:\node\node.exe" set "PATH=E:\node;C:\Windows\System32;%PATH%"
if not exist "dist\index.html" (
  call npm run build
)
npx electron desktop/main.mjs > "%TEMP%\chrona-start.log" 2>&1
