@echo off
cd /d "%~dp0"

if "%ISTEFADAH_PORT%"=="" set ISTEFADAH_PORT=8000
if "%ISTEFADAH_HOST%"=="" set ISTEFADAH_HOST=127.0.0.1

echo Starting Istefadah Venue Booking on http://%ISTEFADAH_HOST%:%ISTEFADAH_PORT%
py -3 app.py

pause
