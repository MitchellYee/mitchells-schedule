@echo off
chcp 65001 > nul
title Mitchell's Working Tool
cd /d "%~dp0app"
if exist "releases\Mitchells-Working-Tool-0.13.0-win32-x64\Mitchells Working Tool.exe" (
  start "" "releases\Mitchells-Working-Tool-0.13.0-win32-x64\Mitchells Working Tool.exe"
  exit /b
)
echo 正在启动 Mitchell's Working Tool ...
call npm run desktop
if errorlevel 1 (
  echo.
  echo 启动失败：请先在 app 目录执行 npm install
  pause
)
