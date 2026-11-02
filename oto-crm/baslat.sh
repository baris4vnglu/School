#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
command -v python3 >/dev/null || { echo "Python 3 bulunamadı: https://www.python.org/downloads/"; exit 1; }

echo "[1/2] Python paketleri kuruluyor"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install -q -r requirements.txt

echo "[2/2] Oto CRM başlatılıyor: http://localhost:8001"
( sleep 2; (open http://localhost:8001 || xdg-open http://localhost:8001) >/dev/null 2>&1 ) &
uvicorn backend.app:app --port 8001
