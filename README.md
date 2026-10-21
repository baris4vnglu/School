# 🩺 Doktor Asistanı

Doktorun yüklediği tıbbi görüntüyü (röntgen, BT, MR, dermatoloji fotoğrafı, EKG…) **lokal** çalışan bir
görsel dil modeliyle (Qwen2.5-VL, Ollama üzerinden) analiz eden ve
"bu hastada şu olabilir, şu tetkikler istenebilir, şu tedavi uygulanabilir" şeklinde öneriler veren
basit bir web arayüzü + chatbot.

Hiçbir veri dışarı gönderilmez: model ve sunucu tamamen kendi bilgisayarınızda çalışır.

> ⚠️ Bu sistem yalnızca **klinik karar desteği** içindir. Tanı ve tedavi kararı her zaman hekime aittir.
> Genel amaçlı bir model kullanıldığından çıktılar hatalı olabilir; klinik kullanım için doğrulanmamıştır.

## Mimari

```
Tarayıcı (frontend/)  ──►  FastAPI (backend/app.py)  ──►  Ollama (localhost:11434)  ──►  qwen2.5vl
   görüntü + hasta bilgisi        sistem promptu ekler           yanıtı akış (stream) olarak döner
```

- `frontend/` — HTML/CSS/JS, framework yok. Görüntü yükleme, hasta bilgileri, sohbet ekranı.
- `backend/app.py` — `/api/chat` (Ollama'ya yönlendirir, yanıtı akış halinde döner) ve `/api/health`.
- Doktor asistanının davranışı `backend/app.py` içindeki `SYSTEM_PROMPT` ile belirlenir.

## Hızlı Başlangıç (tek tık)

1. [Ollama](https://ollama.com/download) ve [Python 3.10+](https://www.python.org/downloads/) kurun.
2. Bu klasörde **Windows:** `baslat.bat` dosyasına çift tıklayın · **Mac/Linux:** `./baslat.sh` çalıştırın.

Script modeli indirir (ilk seferde ~6 GB), paketleri kurar ve tarayıcıda http://localhost:8000 adresini açar.

## Kurulum (elle)

### 1. Ollama ve model

```bash
# https://ollama.com/download adresinden Ollama'yı kurun, sonra:
ollama pull qwen2.5vl:7b      # ~6 GB; zayıf makinede qwen2.5vl:3b deneyin
ollama serve                  # zaten arka planda çalışıyorsa gerekmez
```

### 2. Web uygulaması

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.app:app --reload --port 8000
```

Tarayıcıda **http://localhost:8000** adresini açın.

## Kullanım

1. Görüntüyü sürükleyip bırakın veya tıklayıp seçin.
2. İsteğe bağlı olarak yaş, cinsiyet, görüntü tipi ve şikayeti girin.
3. **Analiz Et**'e basın. Asistan şu başlıklarla yanıt verir:
   Görüntü Bulguları · Olası Ön Tanılar · Önerilen Ek Tetkikler · Olası Tedavi Yaklaşımları · Dikkat Edilmesi Gerekenler
4. Alttaki kutudan takip soruları sorun (ör. "Hangi antibiyotik önerirsin?", "Pnömotoraks ihtimali var mı?").
5. Yeni hasta için **Yeni Hasta**'ya basın.

## Ayarlar

| Ortam değişkeni | Varsayılan | Açıklama |
|---|---|---|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama sunucusunun adresi |
| `OLLAMA_MODEL` | `qwen2.5vl:7b` | Kullanılacak görsel model (ör. `qwen2.5vl:3b`, `llava`, `llama3.2-vision`) |

```bash
OLLAMA_MODEL=qwen2.5vl:3b uvicorn backend.app:app --port 8000
```
