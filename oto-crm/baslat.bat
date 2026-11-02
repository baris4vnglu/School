@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul || (echo Python bulunamadi. https://www.python.org/downloads/ adresinden kurun ^(Add to PATH secili olsun^). & pause & exit /b 1)

echo [1/2] Python paketleri kuruluyor
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt || (pause & exit /b 1)

echo [2/2] Oto CRM baslatiliyor: http://localhost:8001
start "" http://localhost:8001
uvicorn backend.app:app --port 8001
pause
