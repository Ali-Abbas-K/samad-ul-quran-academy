@echo off
setlocal
cd /d "%~dp0"
echo Checking Node.js...
where node >nul 2>&1 || (echo ERROR: Node.js is not installed.&pause&exit /b 1)
if not exist "server\.env" echo No server\.env yet - RUN-ACADEMY/start-server will create it.
echo.
echo Checking http://127.0.0.1:8080/api/health ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8080/api/health' -TimeoutSec 3;Write-Host $r.Content;exit 0}catch{Write-Host ('NOT READY: '+$_.Exception.Message);exit 1}"
echo.
pause
