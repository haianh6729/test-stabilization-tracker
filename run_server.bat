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

REM Start the server. QUAN TRONG: phai chay qua "python app.py" (khong goi thang
REM waitress-serve app:app) - chi cach nay moi kich hoat khoi "if __name__ == '__main__'"
REM trong app.py, noi chay init_db()/init_users_db() (migration DB) + start_backup_daemon().
REM Goi waitress-serve CLI truc tiep se IMPORT module ma KHONG chay khoi do -> migration
REM va backup daemon se KHONG BAO GIO chay, gay loi "no such column" sau moi lan update code.
echo Starting Test Stabilization Tracker on http://localhost:5000
echo Press Ctrl+C to stop the server.
echo.
python app.py
pause
