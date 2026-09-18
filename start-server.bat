@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ===============================================
echo   Samad-ul-Qur'an Academy - Server Launcher
echo ===============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Please install Node.js 22.5+ and run this file again.
  pause
  exit /b 1
)

for /f "tokens=2 delims=v" %%V in ('node --version') do set "NODEVER=%%V"
echo Node.js detected: v!NODEVER!

if not exist "server\.env" (
  echo Creating local server configuration...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$b=New-Object byte[] 48;$rng.GetBytes($b);$jwt=[Convert]::ToBase64String($b);$c=New-Object byte[] 32;$rng.GetBytes($c);$admin=[Convert]::ToBase64String($c);@('PORT=8080','JWT_SECRET='+$jwt,'ADMIN_KEY='+$admin) | Set-Content -Encoding UTF8 'server\.env'"
)

set "PORT=8080"
for /f "usebackq tokens=1,* delims==" %%A in ("server\.env") do if /I "%%A"=="PORT" set "PORT=%%B"
if not defined PORT set "PORT=8080"

echo Checking API on http://127.0.0.1:!PORT! ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:!PORT!/api/health' -TimeoutSec 2;if($r.StatusCode -eq 200 -and $r.Content -match 'Samad Ul Quran'){exit 0}}catch{};exit 1"
if not errorlevel 1 (
  echo Existing Samad server is already running correctly.
  echo Opening website...
  start "" "http://127.0.0.1:!PORT!/student-login.html"
  exit /b 0
)

cd /d "%~dp0server"
if not exist node_modules (
  echo Installing server dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
)

echo Starting backend on port !PORT! ...
node server.js
set "ERR=!ERRORLEVEL!"
echo.
if not "!ERR!"=="0" echo Server stopped with error code !ERR!.
pause
exit /b !ERR!
