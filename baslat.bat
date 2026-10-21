@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%OLLAMA_MODEL%"=="" set OLLAMA_MODEL=qwen2.5vl:7b

where ollama >nul 2>nul || (echo Ollama bulunamadi. https://ollama.com/download adresinden kurun. & pause & exit /b 1)
where python >nul 2>nul || (echo Python bulunamadi. https://www.python.org/downloads/ adresinden kurun ^(Add to PATH secili olsun^). & pause & exit /b 1)

echo [1/3] Model kontrol ediliyor: %OLLAMA_MODEL% (ilk seferde ~6 GB indirilir)
ollama pull %OLLAMA_MODEL% || (echo Model indirilemedi. Ollama uygulamasi acik mi? & pause & exit /b 1)

echo [2/3] Python paketleri kuruluyor
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt || (pause & exit /b 1)

echo [3/3] Uygulama baslatiliyor: http://localhost:8000
start "" http://localhost:8000
uvicorn backend.app:app --port 8000
pause
