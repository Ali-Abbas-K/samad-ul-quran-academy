@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

REM Clean only orphan WAL/SHM files when no main DB exists.
if not exist "data\samad-ul-quran.db" (
  if exist "data\samad-ul-quran.db-wal" del /f /q "data\samad-ul-quran.db-wal" >nul 2>&1
  if exist "data\samad-ul-quran.db-shm" del /f /q "data\samad-ul-quran.db-shm" >nul 2>&1
)

if not exist "server\.env" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$rng=[Security.Cryptography.RandomNumberGenerator]::Create();$b=New-Object byte[] 48;$rng.GetBytes($b);$jwt=[Convert]::ToBase64String($b);$c=New-Object byte[] 32;$rng.GetBytes($c);$admin=[Convert]::ToBase64String($c);@('PORT=8080','JWT_SECRET='+$jwt,'ADMIN_KEY='+$admin) | Set-Content -Encoding UTF8 'server\.env'"
)
set "PORT=8080"
for /f "usebackq tokens=1,* delims==" %%A in ("server\.env") do if /I "%%A"=="PORT" set "PORT=%%B"
if not defined PORT set "PORT=8080"

powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:!PORT!/api/health' -TimeoutSec 2;if($r.StatusCode -eq 200 -and $r.Content -match 'Samad Ul Quran'){exit 0}}catch{};exit 1"
if not errorlevel 1 goto OPEN

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~dp0start-server.bat' -WindowStyle Minimized"
for /l %%N in (1,1,25) do (
  timeout /t 1 /nobreak >nul
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:!PORT!/api/health' -TimeoutSec 1;if($r.StatusCode -eq 200 -and $r.Content -match 'Samad Ul Quran'){exit 0}}catch{};exit 1"
  if not errorlevel 1 goto OPEN
)

echo.
echo ERROR: The Samad-ul-Qur'an server did not become ready.
echo Please run start-server.bat directly to see the exact server error.
pause
exit /b 1

:OPEN
start "Samad Ul Quran Academy" "http://127.0.0.1:!PORT!/index.html"
exit /b 0
