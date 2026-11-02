"""Oto CRM - Araba galerisi için müşteri geçmişi ve "kimi ne zaman arayalım" asistanı.

Tamamen lokal çalışır: veriler SQLite dosyasında (oto-crm/data/crm.db) tutulur.

Çalıştırma (oto-crm klasöründe):
    uvicorn backend.app:app --reload --port 8001

Tahtadaki akış:
    Product (satılan araç) ──► Customer (müşteri geçmişi)
    Customer ──► Analysis (ne zaman yeniler?) ──► Lead (aranacaklar listesi)
    Lead ──► Comm. (nasıl ulaşalım: ara / ziyaret / hediye)
         ──► Content (ne söyleyelim) ──► Media (hangi kanaldan)
    Görüşme sonucu tekrar Customer'a yazılır (geri bildirim okları).
"""

from __future__ import annotations

import csv
import io
import os
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path
from statistics import mean

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "frontend"
DB_PATH = Path(os.getenv("OTO_CRM_DB", ROOT / "data" / "crm.db"))

DEFAULT_SETTINGS = {
    "default_cycle_years": "5",   # tek araç almış müşteri için varsayılan yenileme süresi
    "due_window_days": "180",     # beklenen tarihe bu kadar gün kala listeye girer
    "cooldown_days": "30",        # görüşülen müşteri bu süre listede aşağı düşer
    "vip_purchase_count": "3",    # bu kadar ve üstü alım = VIP
    "vip_total_spend": "3000000", # veya bu kadar toplam harcama = VIP
}

CHANNELS = {
    "telefon": "📞 Telefonla ara",
    "ziyaret": "🏠 Ev/iş yeri ziyareti",
    "hediye": "🎁 Hediye gönder",
    "whatsapp": "💬 WhatsApp / SMS",
    "eposta": "✉️ E-posta",
    "davet": "🚗 Galeriye davet / test sürüşü",
}

OUTCOMES = {
    "ulasilamadi": "Ulaşılamadı",
    "ilgileniyor": "İlgileniyor",
    "randevu": "Randevu alındı",
    "dusunecek": "Düşünecek",
    "ilgilenmiyor": "Şu an ilgilenmiyor",
    "satis": "Satış yapıldı",
}


# --------------------------------------------------------------------------- DB

def db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT, email TEXT, address TEXT, city TEXT,
                birth_date TEXT,
                preferred_channel TEXT,
                notes TEXT,
                created_at TEXT DEFAULT (date('now'))
            );
            CREATE TABLE IF NOT EXISTS purchases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                brand TEXT, model TEXT, model_year INTEGER,
                price REAL, notes TEXT
            );
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                date TEXT NOT NULL,
                channel TEXT, outcome TEXT, notes TEXT,
                next_contact_date TEXT
            );
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
            """
        )
        for k, v in DEFAULT_SETTINGS.items():
            conn.execute("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (k, v))


def get_settings(conn: sqlite3.Connection) -> dict[str, float]:
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    out = {k: float(v) for k, v in DEFAULT_SETTINGS.items()}
    out.update({r["key"]: float(r["value"]) for r in rows})
    return out


def parse_date(s: str | None) -> date | None:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            pass
    raise HTTPException(400, f"Tarih anlaşılamadı: {s!r} (YYYY-AA-GG veya GG.AA.YYYY)")


# --------------------------------------------------------------------- Analysis

def years(days: float) -> float:
    return round(days / 365.25, 1)


def fmt_money(x: float) -> str:
    return f"{x:,.0f} TL".replace(",", ".")


def analyze(customer: dict, purchases: list[dict], contacts: list[dict],
            settings: dict[str, float], today: date | None = None) -> dict:
    """Müşterinin alım alışkanlığını çıkarır ve ne yapılması gerektiğini önerir."""
    today = today or date.today()
    ps = sorted(purchases, key=lambda p: p["date"])
    cs = sorted(contacts, key=lambda c: c["date"])
    n = len(ps)
    total = sum(p["price"] or 0 for p in ps)

    result: dict = {
        "purchase_count": n,
        "total_spend": total,
        "segment": "Aday",
        "status": "veri_yok",
        "status_label": "Alım kaydı yok",
        "score": 0,
        "reasons": [],
        "actions": [],
        "script": "",
    }
    if n == 0:
        return result

    # --- Alım döngüsü
    dates = [date.fromisoformat(p["date"]) for p in ps]
    last_p = ps[-1]
    last_d = dates[-1]
    if n >= 2:
        intervals = [(b - a).days for a, b in zip(dates, dates[1:])]
        cycle_days = mean(intervals)
        cycle_src = f"{n} alımın ortalaması"
    else:
        cycle_days = settings["default_cycle_years"] * 365.25
        cycle_src = "varsayılan (tek alım)"
    expected = last_d + timedelta(days=round(cycle_days))
    days_left = (expected - today).days
    owned_days = (today - last_d).days

    # --- Segment
    if n >= settings["vip_purchase_count"] or total >= settings["vip_total_spend"]:
        segment = "VIP"
    elif n >= 2:
        segment = "Sadık"
    else:
        segment = "Tek alım"

    # --- Son görüşme / erteleme
    last_c = cs[-1] if cs else None
    snooze_until = parse_date(last_c["next_contact_date"]) if last_c and last_c["next_contact_date"] else None
    recently_contacted = bool(
        last_c and (today - date.fromisoformat(last_c["date"])).days < settings["cooldown_days"]
    )

    # --- Durum
    if snooze_until and snooze_until > today:
        status, label = "ertelendi", f"{snooze_until.strftime('%d.%m.%Y')} tarihine ertelendi"
    elif days_left < 0:
        status, label = "gecikmis", f"Yenileme zamanı {abs(days_left)} gün geçti"
    elif days_left <= settings["due_window_days"]:
        status, label = "yaklasiyor", f"Yenileme zamanına {days_left} gün var"
    else:
        status, label = "takipte", f"Yenileme zamanına {days_left} gün var"

    # --- Öncelik puanı (0-100)
    if status == "gecikmis":
        timing = 60
    elif status == "yaklasiyor":
        timing = 35 + 25 * (1 - days_left / max(settings["due_window_days"], 1))
    elif status == "takipte":
        timing = max(0, 20 - days_left / 60)
    else:
        timing = 0
    loyalty = min(25, (n - 1) * 10 + (5 if n else 0))
    value = min(15, total / max(settings["vip_total_spend"], 1) * 15)
    score = timing + loyalty + value
    if recently_contacted and status != "ertelendi":
        score *= 0.4
    if status == "ertelendi":
        score = min(score, 10)

    # --- Gerekçeler (Analysis)
    reasons = [
        f"Son aracı: {last_p['brand'] or ''} {last_p['model'] or ''} — {last_d.strftime('%d.%m.%Y')} ({years(owned_days)} yıldır kullanıyor)".replace("  ", " "),
        f"Ortalama değiştirme süresi: {years(cycle_days)} yıl ({cycle_src})",
        f"Beklenen yeni alım tarihi: {expected.strftime('%d.%m.%Y')}",
        f"Toplam {n} alım, {fmt_money(total)}",
    ]
    if owned_days > 8 * 365:
        reasons.append("Aracı 8 yaşını geçti: bakım masrafları artıyor, takas için güçlü fırsat")
    if last_c:
        reasons.append(
            f"Son görüşme: {date.fromisoformat(last_c['date']).strftime('%d.%m.%Y')} — "
            f"{CHANNELS.get(last_c['channel'], last_c['channel'] or '')} / {OUTCOMES.get(last_c['outcome'], last_c['outcome'] or '')}"
        )
    if recently_contacted and status != "ertelendi":
        reasons.append(f"Son {int(settings['cooldown_days'])} gün içinde görüşüldü, önceliği düşürüldü")

    # --- İletişim önerisi (Comm. + Media)
    actions: list[dict] = []

    def add(ch: str, why: str) -> None:
        for a in actions:
            if a["channel"] == ch:
                a["why"] += " · " + why
                return
        actions.append({"channel": ch, "label": CHANNELS[ch], "why": why})

    hot = status in ("gecikmis", "yaklasiyor")
    pref = customer.get("preferred_channel")
    if pref in CHANNELS and hot:
        add(pref, "Müşterinin tercih ettiği iletişim kanalı")
    if hot:
        if segment == "VIP":
            add("ziyaret", "VIP müşteri: birebir ziyaret ve yeni model kataloğu götürün")
            add("hediye", "VIP müşteri: ziyaret öncesi/sonrası özel hediye (ör. çiçek, premium bakım paketi)")
            add("telefon", "Ziyaret için önce telefonla randevu alın")
        elif segment == "Sadık":
            add("telefon", "Sadık müşteri: kişisel telefonla yenileme teklifi")
            add("davet", "Yeni modelde test sürüşüne davet edin")
            add("hediye", "Küçük bir jest: ücretsiz bakım / yıkama kuponu")
        else:
            add("telefon", "Takas teklifiyle telefonla arayın")
            add("whatsapp", "Ulaşılamazsa kampanya bilgisini WhatsApp/SMS ile gönderin")
            add("davet", "Galeriye kahveye / test sürüşüne davet edin")
    elif status == "takipte":
        add("whatsapp", "Henüz erken: ilişkiyi sıcak tutun (bayram/kampanya mesajı)")
        add("eposta", "Yeni model tanıtımları ve servis hatırlatmaları")
        if segment == "VIP":
            add("hediye", "VIP müşteriye yılda bir hediye ilişkiyi korur")

    bd = parse_date(customer.get("birth_date")) if customer.get("birth_date") else None
    if bd:
        try:
            nxt = bd.replace(year=today.year)
        except ValueError:  # 29 Şubat
            nxt = date(today.year, 3, 1)
        if nxt < today:
            try:
                nxt = bd.replace(year=today.year + 1)
            except ValueError:
                nxt = date(today.year + 1, 3, 1)
        if (nxt - today).days <= 30:
            add("hediye", f"Doğum günü {nxt.strftime('%d.%m')} — tebrik + hediye gönderin")
            reasons.append(f"Doğum günü yaklaşıyor ({nxt.strftime('%d.%m')})")
            score = min(100, score + 10)

    # --- Konuşma metni (Content)
    car = f"{last_p['brand'] or ''} {last_p['model'] or ''}".strip() or "aracınız"
    first = (customer.get("name") or "").split(" ")[0]
    if hot:
        if n >= 2:
            habit = f"Kayıtlarımıza göre araçlarınızı ortalama {years(cycle_days)} yılda bir yeniliyorsunuz"
        else:
            habit = f"{car} ile {years(owned_days)} yılı geride bıraktınız"
        script = (
            f"Merhaba {first}, ben [galeri adı]'ndan [adınız]. {last_d.year} yılında bizden aldığınız "
            f"{car} için sizi aramak istedik. {habit}; "
            f"tam da yenileme zamanı. Şu an aracınızı iyi bir fiyatla takasa alıp "
            f"{last_p['brand'] or 'tercih ettiğiniz markanın'} yeni modellerini size özel koşullarla sunabiliyoruz. "
            f"Bu hafta bir kahve içmeye ve test sürüşüne gelmek ister misiniz?"
        )
    else:
        script = (
            f"Merhaba {first}, [galeri adı]'ndan [adınız]. {car} nasıl gidiyor, memnun musunuz? "
            f"Bakım veya herhangi bir konuda yardımcı olabileceğimiz bir şey olursa bizi arayabilirsiniz."
        )

    result.update(
        segment=segment,
        status=status,
        status_label=label,
        score=round(min(100, score)),
        cycle_years=years(cycle_days),
        expected_date=expected.isoformat(),
        days_left=days_left,
        last_purchase=last_p,
        last_contact=last_c,
        reasons=reasons,
        actions=actions,
        script=script,
    )
    return result


def load_customer(conn: sqlite3.Connection, cid: int) -> tuple[dict, list[dict], list[dict]]:
    row = conn.execute("SELECT * FROM customers WHERE id = ?", (cid,)).fetchone()
    if not row:
        raise HTTPException(404, "Müşteri bulunamadı")
    ps = [dict(r) for r in conn.execute("SELECT * FROM purchases WHERE customer_id = ? ORDER BY date", (cid,))]
    cs = [dict(r) for r in conn.execute("SELECT * FROM contacts WHERE customer_id = ? ORDER BY date", (cid,))]
    return dict(row), ps, cs


def all_analyzed(conn: sqlite3.Connection) -> list[dict]:
    settings = get_settings(conn)
    customers = [dict(r) for r in conn.execute("SELECT * FROM customers")]
    ps_by: dict[int, list] = {}
    cs_by: dict[int, list] = {}
    for r in conn.execute("SELECT * FROM purchases"):
        ps_by.setdefault(r["customer_id"], []).append(dict(r))
    for r in conn.execute("SELECT * FROM contacts"):
        cs_by.setdefault(r["customer_id"], []).append(dict(r))
    out = []
    for c in customers:
        a = analyze(c, ps_by.get(c["id"], []), cs_by.get(c["id"], []), settings)
        out.append({"customer": c, "analysis": a})
    out.sort(key=lambda x: -x["analysis"]["score"])
    return out


# -------------------------------------------------------------------------- API

app = FastAPI(title="Oto CRM")
init_db()


class CustomerIn(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    city: str | None = None
    birth_date: str | None = None
    preferred_channel: str | None = None
    notes: str | None = None


class PurchaseIn(BaseModel):
    date: str
    brand: str | None = None
    model: str | None = None
    model_year: int | None = None
    price: float | None = None
    notes: str | None = None


class ContactIn(BaseModel):
    date: str | None = None
    channel: str
    outcome: str | None = None
    notes: str | None = None
    next_contact_date: str | None = None


def clean_date(s: str | None) -> str | None:
    d = parse_date(s) if s else None
    return d.isoformat() if d else None


@app.get("/api/meta")
def meta():
    return {"channels": CHANNELS, "outcomes": OUTCOMES}


@app.get("/api/leads")
def leads():
    """Aranacaklar listesi: öncelik puanına göre sıralı."""
    with db() as conn:
        items = all_analyzed(conn)
    hot = [i for i in items if i["analysis"]["status"] in ("gecikmis", "yaklasiyor")]
    stats = {
        "customers": len(items),
        "gecikmis": sum(i["analysis"]["status"] == "gecikmis" for i in items),
        "yaklasiyor": sum(i["analysis"]["status"] == "yaklasiyor" for i in items),
        "vip": sum(i["analysis"]["segment"] == "VIP" for i in items),
    }
    return {"stats": stats, "leads": hot}


@app.get("/api/customers")
def list_customers(q: str = ""):
    with db() as conn:
        items = all_analyzed(conn)
    if q:
        ql = q.lower()
        items = [
            i for i in items
            if ql in (i["customer"]["name"] or "").lower()
            or ql in (i["customer"]["phone"] or "")
            or ql in (i["customer"]["city"] or "").lower()
        ]
    items.sort(key=lambda i: (i["customer"]["name"] or "").lower())
    return items


@app.post("/api/customers")
def create_customer(c: CustomerIn):
    data = c.model_dump()
    data["birth_date"] = clean_date(data["birth_date"])
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO customers(name, phone, email, address, city, birth_date, preferred_channel, notes) "
            "VALUES (:name, :phone, :email, :address, :city, :birth_date, :preferred_channel, :notes)",
            data,
        )
        return {"id": cur.lastrowid}


@app.get("/api/customers/{cid}")
def get_customer(cid: int):
    with db() as conn:
        c, ps, cs = load_customer(conn, cid)
        a = analyze(c, ps, cs, get_settings(conn))
    return {"customer": c, "purchases": ps, "contacts": cs, "analysis": a}


@app.put("/api/customers/{cid}")
def update_customer(cid: int, c: CustomerIn):
    data = c.model_dump() | {"id": cid}
    data["birth_date"] = clean_date(data["birth_date"])
    with db() as conn:
        load_customer(conn, cid)
        conn.execute(
            "UPDATE customers SET name=:name, phone=:phone, email=:email, address=:address, city=:city, "
            "birth_date=:birth_date, preferred_channel=:preferred_channel, notes=:notes WHERE id=:id",
            data,
        )
    return {"ok": True}


@app.delete("/api/customers/{cid}")
def delete_customer(cid: int):
    with db() as conn:
        conn.execute("DELETE FROM customers WHERE id = ?", (cid,))
    return {"ok": True}


@app.post("/api/customers/{cid}/purchases")
def add_purchase(cid: int, p: PurchaseIn):
    data = p.model_dump() | {"customer_id": cid}
    data["date"] = clean_date(data["date"])
    with db() as conn:
        load_customer(conn, cid)
        conn.execute(
            "INSERT INTO purchases(customer_id, date, brand, model, model_year, price, notes) "
            "VALUES (:customer_id, :date, :brand, :model, :model_year, :price, :notes)",
            data,
        )
    return {"ok": True}


@app.delete("/api/purchases/{pid}")
def delete_purchase(pid: int):
    with db() as conn:
        conn.execute("DELETE FROM purchases WHERE id = ?", (pid,))
    return {"ok": True}


@app.post("/api/customers/{cid}/contacts")
def add_contact(cid: int, c: ContactIn):
    data = c.model_dump() | {"customer_id": cid}
    data["date"] = clean_date(data["date"]) or date.today().isoformat()
    data["next_contact_date"] = clean_date(data["next_contact_date"])
    with db() as conn:
        load_customer(conn, cid)
        conn.execute(
            "INSERT INTO contacts(customer_id, date, channel, outcome, notes, next_contact_date) "
            "VALUES (:customer_id, :date, :channel, :outcome, :notes, :next_contact_date)",
            data,
        )
    return {"ok": True}


@app.delete("/api/contacts/{xid}")
def delete_contact(xid: int):
    with db() as conn:
        conn.execute("DELETE FROM contacts WHERE id = ?", (xid,))
    return {"ok": True}


@app.get("/api/settings")
def read_settings():
    with db() as conn:
        return get_settings(conn)


@app.put("/api/settings")
def write_settings(values: dict[str, float]):
    with db() as conn:
        for k, v in values.items():
            if k in DEFAULT_SETTINGS:
                conn.execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", (k, str(v)))
        return get_settings(conn)


def parse_price(s: str | None) -> float | None:
    """'1.250.000', '1.250.000,50', '1250000', '1,250,000 TL' gibi yazımları sayıya çevirir."""
    s = (s or "").upper().replace("TL", "").replace("₺", "").replace(" ", "")
    if not s:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", "") if len(s.split(",")[-1]) == 3 else s.replace(",", ".")
    elif s.count(".") > 1 or (s.count(".") == 1 and len(s.split(".")[-1]) == 3):
        s = s.replace(".", "")
    try:
        return float(s)
    except ValueError:
        return None


@app.post("/api/import")
async def import_csv(file: UploadFile):
    """CSV içe aktarma. Sütunlar: ad, telefon, tarih, marka, model, fiyat (+ isteğe bağlı sehir, eposta).
    Aynı ad+telefon tek müşteri sayılır; her satır bir alımdır."""
    raw = (await file.read()).decode("utf-8-sig")
    sample = raw[:2000]
    delim = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(raw), delimiter=delim)
    added_c = added_p = 0
    with db() as conn:
        for row in reader:
            r = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            name = r.get("ad") or r.get("isim") or r.get("name")
            if not name or not r.get("tarih"):
                continue
            phone = r.get("telefon") or r.get("phone") or None
            found = conn.execute(
                "SELECT id FROM customers WHERE name = ? AND IFNULL(phone,'') = IFNULL(?,'')", (name, phone)
            ).fetchone()
            if found:
                cid = found["id"]
            else:
                cid = conn.execute(
                    "INSERT INTO customers(name, phone, email, city) VALUES (?, ?, ?, ?)",
                    (name, phone, r.get("eposta") or None, r.get("sehir") or None),
                ).lastrowid
                added_c += 1
            price = parse_price(r.get("fiyat"))
            conn.execute(
                "INSERT INTO purchases(customer_id, date, brand, model, price) VALUES (?, ?, ?, ?, ?)",
                (cid, clean_date(r["tarih"]), r.get("marka"), r.get("model"), price),
            )
            added_p += 1
    return {"customers": added_c, "purchases": added_p}


@app.post("/api/demo")
def load_demo():
    """Örnek veriler: denemek için."""
    t = date.today()

    def ago(y: float, extra_days: int = 0) -> str:
        return (t - timedelta(days=round(y * 365.25) + extra_days)).isoformat()

    demo = [
        # 3 senede bir araba alan, son arabasını ~3 yıl önce almış -> şimdi aranmalı
        ({"name": "Ahmet Yılmaz", "phone": "0532 111 22 33", "city": "Lefkoşa", "address": "Göçmenköy",
          "birth_date": (t + timedelta(days=12)).replace(year=1978).isoformat()},
         [(ago(9), "Toyota", "Corolla", 950000), (ago(6), "Toyota", "C-HR", 1300000), (ago(3, 15), "Toyota", "RAV4", 1900000)]),
        # 10 yıl önce tek araç almış -> varsayılan süreyi çoktan geçti
        ({"name": "Ayşe Demir", "phone": "0533 444 55 66", "city": "Girne"},
         [(ago(10), "Renault", "Clio", 450000)]),
        # VIP: çok alım, yüksek harcama -> ev ziyareti + hediye
        ({"name": "Mehmet Kaya", "phone": "0542 777 88 99", "city": "Gazimağusa", "address": "Sakarya Mah.",
          "preferred_channel": "ziyaret"},
         [(ago(8), "BMW", "320i", 1800000), (ago(6), "BMW", "520d", 2600000),
          (ago(4), "Mercedes", "E200", 3100000), (ago(2, -30), "BMW", "X5", 4800000)]),
        # Yakın zamanda almış -> takipte
        ({"name": "Elif Şahin", "phone": "0548 222 33 44", "city": "Lefkoşa"},
         [(ago(0.5), "Hyundai", "i20", 900000)]),
        # 2 alım, 4 yıl arayla, son alım 3.7 yıl önce -> yaklaşıyor
        ({"name": "Can Öztürk", "phone": "0533 999 00 11", "city": "Güzelyurt", "preferred_channel": "whatsapp"},
         [(ago(7.7), "Volkswagen", "Polo", 600000), (ago(3.7), "Volkswagen", "Golf", 1100000)]),
    ]
    with db() as conn:
        for cust, purchases in demo:
            cust = {"address": None, "birth_date": None, "preferred_channel": None, "email": None, "notes": None} | cust
            cid = conn.execute(
                "INSERT INTO customers(name, phone, email, address, city, birth_date, preferred_channel, notes) "
                "VALUES (:name, :phone, :email, :address, :city, :birth_date, :preferred_channel, :notes)",
                cust,
            ).lastrowid
            for d, b, m, p in purchases:
                conn.execute(
                    "INSERT INTO purchases(customer_id, date, brand, model, price) VALUES (?, ?, ?, ?, ?)",
                    (cid, d, b, m, p),
                )
    return {"ok": True}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")
