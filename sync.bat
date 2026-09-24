@echo off
setlocal
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%sync.ps1" %*
exit /b %ERRORLEVEL%
