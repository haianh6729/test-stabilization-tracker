@echo off
REM Batch file to start the Test Stabilization Tracker server using Waitress
REM Change to the script's directory
cd /d "%~dp0"

REM Check if requirements are installed
python -m pip show waitress > nul 2>&1
if errorlevel 1 (
    echo Installing requirements...
    python -m pip install -r requirements.txt
)

REM Start the server
echo Starting Test Stabilization Tracker on http://localhost:5000
echo Press Ctrl+C to stop the server.
echo.
waitress-serve --host=0.0.0.0 --port=5000 --threads=4 app:app
pause
