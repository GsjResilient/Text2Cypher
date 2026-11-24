@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS, version 24.15.0 or newer.
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo Edit .env with your model and Neo4j credentials, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci
  if errorlevel 1 exit /b 1
)
echo Open http://127.0.0.1:3210 in your browser.
call npm.cmd start
pause
