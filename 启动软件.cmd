@echo off
chcp 65001 > nul
title Mitchell's Schedule
cd /d "%~dp0app"
echo 正在启动 Mitchell's Schedule ...
call npm run desktop
if errorlevel 1 (
  echo.
  echo 启动失败：请先在 app 目录执行 npm install
  pause
)
