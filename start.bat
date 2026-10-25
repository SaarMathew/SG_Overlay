@echo off
rem SaarGaming broadcast overlay - match day start (double click).
rem Extra arguments are passed through, e.g.  start.bat --record   or   start.bat --mock
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 22+ is required: https://nodejs.org & pause & exit /b 1)
if not exist node_modules call npm install
if not exist dist\web\admin\index.html call npm run build
start "" http://127.0.0.1:3210/admin/
call npx tsx server/main.ts %*
pause
