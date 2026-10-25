@echo off
rem SaarGaming broadcast overlay - developer start from the repo (needs Node.js installed).
rem For the observer PC use the packaged SG-Overlay.zip instead (npm run package): it includes Node.js.
rem Extra arguments are passed through, e.g.  start.bat --record   or   start.bat --mock
cd /d "%~dp0"
where node >nul 2>nul || (
  echo.
  echo  Node.js was not found on this PC.
  echo.
  echo  This is the developer version from the repository. For the observer PC use
  echo  SG-Overlay.zip instead ^(build it with "npm run package"^) - it already contains Node.js.
  echo.
  echo  Or install Node.js 22 or newer ^(LTS^): https://nodejs.org
  echo.
  pause
  exit /b 1
)
rem After "git pull": reinstall dependencies when package-lock.json changed, and always rebuild the
rem overlays/admin (a few seconds) so the browser and OBS never get the previous version.
set "NEEDINSTALL="
if not exist node_modules\.sg-lock (set NEEDINSTALL=1) else (fc /b package-lock.json node_modules\.sg-lock >nul || set NEEDINSTALL=1)
if defined NEEDINSTALL (
  echo Installing dependencies...
  call npm install --no-audit --no-fund || (echo npm install failed & pause & exit /b 1)
  copy /y package-lock.json node_modules\.sg-lock >nul
)
echo Building overlays...
call npm run build --silent || (echo Build failed & pause & exit /b 1)
start "" http://127.0.0.1:3210/admin/
call npx tsx server/main.ts %*
pause
