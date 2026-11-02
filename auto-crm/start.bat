@echo off
cd /d "%~dp0"

where python >nul 2>nul || (echo Python not found. Install it from https://www.python.org/downloads/ ^(tick "Add to PATH"^). & pause & exit /b 1)

echo [1/2] Installing Python packages
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt || (pause & exit /b 1)

echo [2/2] Starting Auto CRM: http://localhost:8001
start "" http://localhost:8001
uvicorn backend.app:app --port 8001
pause
