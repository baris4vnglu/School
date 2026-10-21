"""Doktor Asistanı - Ollama (Qwen-VL) ile lokal çalışan görüntü analiz chatbotu.

Çalıştırma:
    uvicorn backend.app:app --reload --port 8000
"""

import json
import os
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5vl:7b")
STATIC_DIR = Path(__file__).resolve().parent.parent / "frontend"

SYSTEM_PROMPT = """Sen deneyimli bir klinik karar destek asistanısın ve bir doktorla konuşuyorsun.
Doktor sana tıbbi görüntüler (röntgen, BT, MR, dermatoloji fotoğrafı, EKG vb.) ve hasta bilgileri verir.

Görevin:
1. Görüntüyü dikkatlice incele ve gördüğün bulguları tarif et.
2. Bulgulara ve hasta bilgilerine göre olası ön tanıları olasılık sırasıyla listele (ayırıcı tanı).
3. Tanıyı netleştirmek için önerilebilecek ek tetkikleri yaz.
4. Literatürde ve kılavuzlarda yer alan olası tedavi yaklaşımlarını öner.
5. Acil durum (kırmızı bayrak) bulgusu varsa en başta açıkça belirt.

Cevabını Türkçe ve şu başlıklarla ver:
## Görüntü Bulguları
## Olası Ön Tanılar
## Önerilen Ek Tetkikler
## Olası Tedavi Yaklaşımları
## Dikkat Edilmesi Gerekenler

Kurallar:
- Emin olmadığın noktaları açıkça "belirsiz" olarak işaretle, uydurma.
- Görüntü kalitesi yetersizse veya görüntü tıbbi değilse bunu söyle.
- Son karar her zaman doktora aittir; sen yalnızca destek sağlarsın.
- Takip sorularında önceki konuşmayı ve görüntüyü dikkate al."""

app = FastAPI(title="Doktor Asistanı")


class Message(BaseModel):
    role: str
    content: str
    images: list[str] | None = None  # base64 (data: öneki olmadan)


class ChatRequest(BaseModel):
    messages: list[Message]
    model: str | None = None


@app.get("/api/health")
async def health():
    """Ollama'ya erişilebiliyor mu ve model yüklü mü kontrol eder."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{OLLAMA_HOST}/api/tags")
            r.raise_for_status()
            models = [m["name"] for m in r.json().get("models", [])]
    except httpx.HTTPError as e:
        return {"ollama": False, "error": str(e), "model": OLLAMA_MODEL, "models": []}
    return {
        "ollama": True,
        "model": OLLAMA_MODEL,
        "model_available": OLLAMA_MODEL in models,
        "models": models,
    }


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not req.messages:
        raise HTTPException(400, "Mesaj boş olamaz")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in req.messages:
        msg = {"role": m.role, "content": m.content}
        if m.images:
            msg["images"] = m.images
        messages.append(msg)

    payload = {
        "model": req.model or OLLAMA_MODEL,
        "messages": messages,
        "stream": True,
        "options": {"temperature": 0.2},
    }

    async def stream():
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("POST", f"{OLLAMA_HOST}/api/chat", json=payload) as r:
                    if r.status_code != 200:
                        body = (await r.aread()).decode(errors="replace")
                        yield f"\n\n**Hata:** Ollama {r.status_code} döndürdü: {body}"
                        return
                    async for line in r.aiter_lines():
                        if not line:
                            continue
                        chunk = json.loads(line)
                        if "error" in chunk:
                            yield f"\n\n**Hata:** {chunk['error']}"
                            return
                        yield chunk.get("message", {}).get("content", "")
        except httpx.HTTPError as e:
            yield (
                f"\n\n**Hata:** Ollama'ya bağlanılamadı ({OLLAMA_HOST}). "
                f"`ollama serve` çalışıyor mu? Detay: {e}"
            )

    return StreamingResponse(stream(), media_type="text/plain; charset=utf-8")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")
