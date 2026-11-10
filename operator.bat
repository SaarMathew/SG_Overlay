@echo off
rem Opens the floating operator bar (SG Overlay must be running). Options: operator.bat -Port 3210 -X 100 -Y 8
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\operator.ps1" %*
