@echo off
title SSK ERP
cd /d "%~dp0"

echo Starting SSK ERP...
echo Backend: http://localhost:4000
echo App:     http://localhost:3000
echo.

if not exist "node_modules\" (
  echo Installing root packages...
  call npm install
)
if not exist "backend\node_modules\" (
  echo Installing backend packages...
  call npm install --prefix backend
)
if not exist "frontend\node_modules\" (
  echo Installing frontend packages...
  call npm install --prefix frontend
)

if not exist "backend\.env" (
  echo ERROR: backend\.env is missing.
  echo Copy backend\.env.example to backend\.env and set the database password.
  pause
  exit /b 1
)

start "SSK Backend" /min cmd /c "cd /d "%~dp0backend" && npm start"
timeout /t 3 /nobreak >nul
start "SSK Frontend" /min cmd /c "cd /d "%~dp0frontend" && set BROWSER=none&& npm start"

echo Waiting for the app to open...
timeout /t 12 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo SSK is starting. Keep this window open, or minimize it.
echo Close this window only after you close the Backend/Frontend windows to stop later.
pause
