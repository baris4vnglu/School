"""Auto CRM - customer history and "who should we contact, and how" assistant for a car dealership.

Runs fully locally: data is stored in a SQLite file (auto-crm/data/crm.db).

Run (inside the auto-crm folder):
    uvicorn backend.app:app --reload --port 8001

Flow from the whiteboard:
    Product (car sold) ──► Customer (purchase history)
    Customer ──► Analysis (when will they change cars?) ──► Lead (contact list)
    Lead ──► Comm. (how to reach them: call / visit / gift)
         ──► Content (what to say) ──► Media (which channel, 30-second ad video)
    The outcome of each contact is written back to the Customer (feedback arrows).
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
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT / "frontend"
DB_PATH = Path(os.getenv("AUTO_CRM_DB", ROOT / "data" / "crm.db"))
SAMPLE_CSV = ROOT / "sample-data" / "customer-list.csv"

DEFAULT_SETTINGS = {
    "default_cycle_years": "5",   # assumed replacement cycle for one-time buyers
    "due_window_days": "180",     # customers enter the list this many days before the expected date
    "cooldown_days": "30",        # a contacted customer drops down the list for this many days
    "vip_purchase_count": "3",    # this many purchases or more = VIP
    "vip_total_spend": "3000000", # or this much total spend = VIP
}
TEXT_SETTINGS = {                 # used in the call script and the ad video
    "dealer_name": "Your Dealership",
    "dealer_phone": "+90 392 000 00 00",
    "dealer_address": "Main Street 1, Nicosia",
}

CHANNELS = {
    "phone": "📞 Call",
    "visit": "🏠 Home / office visit",
    "gift": "🎁 Send a gift",
    "message": "💬 WhatsApp / SMS",
    "video": "🎬 Send 30s ad video",
    "email": "✉️ Email",
    "invite": "🚗 Invite to showroom / test drive",
}

OUTCOMES = {
    "no_answer": "No answer",
    "interested": "Interested",
    "appointment": "Appointment booked",
    "thinking": "Will think about it",
    "not_interested": "Not interested right now",
    "sold": "Sale made",
}

# Keys used by the earlier Turkish version, migrated on start-up.
LEGACY_KEYS = {
    "telefon": "phone", "ziyaret": "visit", "hediye": "gift", "whatsapp": "message",
    "eposta": "email", "davet": "invite",
    "ulasilamadi": "no_answer", "ilgileniyor": "interested", "randevu": "appointment",
    "dusunecek": "thinking", "ilgilenmiyor": "not_interested", "satis": "sold",
}

HOT = ("overdue", "due_soon")


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
        for k, v in (DEFAULT_SETTINGS | TEXT_SETTINGS).items():
            conn.execute("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (k, v))
        for old, new in LEGACY_KEYS.items():
            conn.execute("UPDATE customers SET preferred_channel=? WHERE preferred_channel=?", (new, old))
            conn.execute("UPDATE contacts SET channel=? WHERE channel=?", (new, old))
            conn.execute("UPDATE contacts SET outcome=? WHERE outcome=?", (new, old))


def get_settings(conn: sqlite3.Connection) -> dict:
    rows = {r["key"]: r["value"] for r in conn.execute("SELECT key, value FROM settings")}
    out: dict = {k: float(rows.get(k, v)) for k, v in DEFAULT_SETTINGS.items()}
    out.update({k: rows.get(k, v) for k, v in TEXT_SETTINGS.items()})
    return out


def parse_date(s: str | None) -> date | None:
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).date()
        except ValueError:
            pass
    raise HTTPException(400, f"Could not read date: {s!r} (use YYYY-MM-DD or DD.MM.YYYY)")


def clean_date(s: str | None) -> str | None:
    d = parse_date(s) if s else None
    return d.isoformat() if d else None


# --------------------------------------------------------------------- Analysis

def years(days: float) -> float:
    return round(days / 365.25, 1)


def fmt_money(x: float) -> str:
    return f"{x:,.0f} TL"


def fmt_date(d: date) -> str:
    return d.strftime("%d %b %Y")


def plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def analyze(customer: dict, purchases: list[dict], contacts: list[dict],
            settings: dict, today: date | None = None) -> dict:
    """Works out the customer's buying habit and recommends what to do next."""
    today = today or date.today()
    ps = sorted(purchases, key=lambda p: p["date"])
    cs = sorted(contacts, key=lambda c: c["date"])
    n = len(ps)
    total = sum(p["price"] or 0 for p in ps)

    result: dict = {
        "purchase_count": n,
        "total_spend": total,
        "segment": "Prospect",
        "status": "no_data",
        "status_label": "No purchases yet",
        "score": 0,
        "reasons": [],
        "actions": [],
        "script": "",
    }
    if n == 0:
        return result

    # --- Purchase cycle
    dates = [date.fromisoformat(p["date"]) for p in ps]
    last_p = ps[-1]
    last_d = dates[-1]
    if n >= 2:
        cycle_days = mean((b - a).days for a, b in zip(dates, dates[1:]))
        cycle_src = f"average of {n} purchases"
    else:
        cycle_days = settings["default_cycle_years"] * 365.25
        cycle_src = "default for one-time buyers"
    expected = last_d + timedelta(days=round(cycle_days))
    days_left = (expected - today).days
    owned_days = (today - last_d).days

    # --- Segment
    if n >= settings["vip_purchase_count"] or total >= settings["vip_total_spend"]:
        segment = "VIP"
    elif n >= 2:
        segment = "Loyal"
    else:
        segment = "One-time"

    # --- Last contact / snooze
    last_c = cs[-1] if cs else None
    snooze_until = parse_date(last_c["next_contact_date"]) if last_c and last_c["next_contact_date"] else None
    recently_contacted = bool(
        last_c and (today - date.fromisoformat(last_c["date"])).days < settings["cooldown_days"]
    )

    # --- Status
    if snooze_until and snooze_until > today:
        status, label = "snoozed", f"Snoozed until {fmt_date(snooze_until)}"
    elif days_left < 0:
        status, label = "overdue", f"Replacement {plural(abs(days_left), 'day')} overdue"
    elif days_left <= settings["due_window_days"]:
        status, label = "due_soon", f"Replacement due in {plural(days_left, 'day')}"
    else:
        status, label = "on_track", f"Replacement due in {plural(days_left, 'day')}"

    # --- Priority score (0-100)
    if status == "overdue":
        timing = 60
    elif status == "due_soon":
        timing = 35 + 25 * (1 - days_left / max(settings["due_window_days"], 1))
    elif status == "on_track":
        timing = max(0, 20 - days_left / 60)
    else:
        timing = 0
    loyalty = min(25, (n - 1) * 10 + 5)
    value = min(15, total / max(settings["vip_total_spend"], 1) * 15)
    score = timing + loyalty + value
    if recently_contacted and status != "snoozed":
        score *= 0.4
    if status == "snoozed":
        score = min(score, 10)

    # --- Reasons (Analysis)
    car = f"{last_p['brand'] or ''} {last_p['model'] or ''}".strip() or "their car"
    reasons = [
        f"Current car: {car}, bought {fmt_date(last_d)} (driving it for {years(owned_days)} years)",
        f"Average replacement cycle: {years(cycle_days)} years ({cycle_src})",
        f"Expected next purchase: {fmt_date(expected)}",
        f"{plural(n, 'purchase')} in total, {fmt_money(total)}",
    ]
    if owned_days > 8 * 365:
        reasons.append("The car is over 8 years old: maintenance costs are rising, a strong trade-in opportunity")
    if last_c:
        reasons.append(
            f"Last contact: {fmt_date(date.fromisoformat(last_c['date']))} — "
            f"{CHANNELS.get(last_c['channel'], last_c['channel'] or '')} / "
            f"{OUTCOMES.get(last_c['outcome'], last_c['outcome'] or '')}"
        )
    if recently_contacted and status != "snoozed":
        reasons.append(f"Contacted within the last {int(settings['cooldown_days'])} days, priority lowered")

    # --- Contact recommendation (Comm. + Media)
    actions: list[dict] = []

    def add(ch: str, why: str) -> None:
        for a in actions:
            if a["channel"] == ch:
                a["why"] += " · " + why
                return
        actions.append({"channel": ch, "label": CHANNELS[ch], "why": why})

    hot = status in HOT
    pref = customer.get("preferred_channel")
    if pref in CHANNELS and hot:
        add(pref, "The customer's preferred channel")
    if hot:
        if segment == "VIP":
            add("visit", "VIP customer: visit in person and bring the new model catalogue")
            add("gift", "VIP customer: a special gift before or after the visit (e.g. flowers, premium service package)")
            add("phone", "Call first to book the visit")
        elif segment == "Loyal":
            add("phone", "Loyal customer: a personal call with an upgrade offer")
            add("video", "Send their personalised 30-second ad video on WhatsApp")
            add("invite", "Invite them to test drive the new model")
            add("gift", "A small gesture: free service or car wash voucher")
        else:
            add("phone", "Call with a trade-in offer")
            add("video", "If you can't reach them, send the 30-second ad video on WhatsApp")
            add("invite", "Invite them to the showroom for a coffee and a test drive")
    elif status == "on_track":
        add("message", "Still early: keep the relationship warm (holiday / campaign message)")
        add("email", "New model launches and service reminders")
        if segment == "VIP":
            add("gift", "A yearly gift keeps VIP customers close")

    bd = parse_date(customer.get("birth_date")) if customer.get("birth_date") else None
    if bd:
        def bday(y: int) -> date:
            try:
                return bd.replace(year=y)
            except ValueError:  # 29 February
                return date(y, 3, 1)
        nxt = bday(today.year)
        if nxt < today:
            nxt = bday(today.year + 1)
        if (nxt - today).days <= 30:
            add("gift", f"Birthday on {nxt.strftime('%d %b')}: send wishes and a gift")
            reasons.append(f"Birthday coming up ({nxt.strftime('%d %b')})")
            score = min(100, score + 10)

    # --- Call script (Content)
    first = (customer.get("name") or "").split(" ")[0]
    dealer = settings.get("dealer_name") or "[dealership]"
    if hot:
        if n >= 2:
            habit = f"Our records show you usually change your car every {years(cycle_days)} years"
        else:
            habit = f"You've been driving the {car} for {years(owned_days)} years now"
        script = (
            f"Hi {first}, this is [your name] from {dealer}. We're calling about the {car} "
            f"you bought from us in {last_d.year}. {habit}, so it's the perfect time for an upgrade. "
            f"Right now we can take your car as a trade-in at a great price and offer you the new "
            f"{last_p['brand'] or 'models'} range on special terms. "
            f"Would you like to drop by this week for a coffee and a test drive?"
        )
    else:
        script = (
            f"Hi {first}, this is [your name] from {dealer}. How is the {car} treating you? "
            f"If you ever need anything — service or anything else — just give us a call."
        )

    result.update(
        segment=segment,
        status=status,
        status_label=label,
        score=round(min(100, score)),
        cycle_years=years(cycle_days),
        expected_date=expected.isoformat(),
        days_left=days_left,
        owned_years=years(owned_days),
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
        raise HTTPException(404, "Customer not found")
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
    out = [
        {"customer": c, "analysis": analyze(c, ps_by.get(c["id"], []), cs_by.get(c["id"], []), settings)}
        for c in customers
    ]
    out.sort(key=lambda x: -x["analysis"]["score"])
    return out


# -------------------------------------------------------------------------- API

app = FastAPI(title="Auto CRM")
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


@app.get("/api/meta")
def meta():
    return {"channels": CHANNELS, "outcomes": OUTCOMES}


@app.get("/api/leads")
def leads():
    """Contact list, sorted by priority score."""
    with db() as conn:
        items = all_analyzed(conn)
    hot = [i for i in items if i["analysis"]["status"] in HOT]
    stats = {
        "customers": len(items),
        "overdue": sum(i["analysis"]["status"] == "overdue" for i in items),
        "due_soon": sum(i["analysis"]["status"] == "due_soon" for i in items),
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
def write_settings(values: dict[str, float | str]):
    with db() as conn:
        for k, v in values.items():
            if k in DEFAULT_SETTINGS:
                try:
                    v = float(v)
                except (TypeError, ValueError):
                    raise HTTPException(400, f"{k} must be a number")
            elif k not in TEXT_SETTINGS:
                continue
            conn.execute("INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)", (k, str(v)))
        return get_settings(conn)


# ----------------------------------------------------------------- CSV import / export

def parse_price(s: str | None) -> float | None:
    """Turns '1.250.000', '1.250.000,50', '1250000', '1,250,000 TL' etc. into a number."""
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


CSV_COLUMNS = ["name", "phone", "email", "city", "address", "birth_date", "preferred_channel",
               "purchase_date", "brand", "model", "model_year", "price", "notes"]
# Accepted header names for each column (English first, plus the Turkish headers of the earlier version).
ALIASES = {
    "name": ["name", "full name", "customer", "ad", "ad soyad", "isim", "müşteri", "musteri"],
    "phone": ["phone", "telephone", "mobile", "tel", "telefon", "gsm"],
    "email": ["email", "e-mail", "mail", "eposta", "e-posta"],
    "city": ["city", "town", "sehir", "şehir", "il"],
    "address": ["address", "adres"],
    "birth_date": ["birth_date", "birthday", "date of birth", "dob", "dogum_tarihi", "doğum tarihi"],
    "preferred_channel": ["preferred_channel", "channel", "preference", "tercih", "kanal"],
    "purchase_date": ["purchase_date", "date", "purchase date", "sale date", "tarih", "alış tarihi"],
    "brand": ["brand", "make", "marka"],
    "model": ["model"],
    "model_year": ["model_year", "model year", "year", "model_yili", "model yılı"],
    "price": ["price", "amount", "fiyat", "tutar"],
    "notes": ["notes", "note", "comment", "not", "notlar", "açıklama"],
}


def _pick(r: dict, key: str) -> str | None:
    for a in ALIASES[key]:
        if r.get(a):
            return r[a]
    return None


def import_text(raw: str) -> dict:
    """Imports CSV text. Each row is one purchase; if the date is empty only the customer is added.
    The same name+phone is one customer, and the same purchase (customer+date+brand+model) is never added twice."""
    sample = raw[:2000]
    delim = ";" if sample.count(";") > sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(raw), delimiter=delim)
    added_c = added_p = skipped = 0
    with db() as conn:
        for row in reader:
            r = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            name = _pick(r, "name")
            if not name:
                skipped += 1
                continue
            phone = _pick(r, "phone")
            pref = (_pick(r, "preferred_channel") or "").lower()
            pref = LEGACY_KEYS.get(pref, pref)
            pref = pref if pref in CHANNELS else None
            fields = (_pick(r, "email"), _pick(r, "city"), _pick(r, "address"),
                      clean_date(_pick(r, "birth_date")), pref)
            found = conn.execute(
                "SELECT id FROM customers WHERE name = ? AND IFNULL(phone,'') = IFNULL(?,'')", (name, phone)
            ).fetchone()
            if found:
                cid = found["id"]
                conn.execute(  # fill in missing details
                    "UPDATE customers SET email=IFNULL(email,?), city=IFNULL(city,?), address=IFNULL(address,?), "
                    "birth_date=IFNULL(birth_date,?), preferred_channel=IFNULL(preferred_channel,?) WHERE id=?",
                    (*fields, cid),
                )
            else:
                cid = conn.execute(
                    "INSERT INTO customers(name, phone, email, city, address, birth_date, preferred_channel) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (name, phone, *fields),
                ).lastrowid
                added_c += 1
            d = clean_date(_pick(r, "purchase_date"))
            if not d:  # prospect without a purchase: keep the note on the customer
                if _pick(r, "notes"):
                    conn.execute("UPDATE customers SET notes=IFNULL(notes,?) WHERE id=?", (_pick(r, "notes"), cid))
                continue
            brand, model = _pick(r, "brand"), _pick(r, "model")
            dup = conn.execute(
                "SELECT 1 FROM purchases WHERE customer_id=? AND date=? AND IFNULL(brand,'')=IFNULL(?,'') "
                "AND IFNULL(model,'')=IFNULL(?,'')", (cid, d, brand, model),
            ).fetchone()
            if dup:
                skipped += 1
                continue
            my = _pick(r, "model_year")
            conn.execute(
                "INSERT INTO purchases(customer_id, date, brand, model, model_year, price, notes) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (cid, d, brand, model, int(my) if my and my.isdigit() else None,
                 parse_price(_pick(r, "price")), _pick(r, "notes")),
            )
            added_p += 1
    return {"customers": added_c, "purchases": added_p, "skipped": skipped}


@app.post("/api/import")
async def import_csv(file: UploadFile):
    """CSV import (e.g. a file saved from Excel as 'CSV UTF-8')."""
    data = await file.read()
    try:
        raw = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raw = data.decode("cp1254")  # Excel's Turkish Windows encoding
    return import_text(raw)


@app.post("/api/import-sample")
def import_sample():
    """Loads the ready-made list in auto-crm/sample-data/customer-list.csv."""
    return import_text(SAMPLE_CSV.read_text(encoding="utf-8-sig"))


@app.get("/api/export")
def export_csv():
    """Downloads the whole customer list (with purchases) as a CSV that opens in Excel."""
    out = io.StringIO()
    w = csv.writer(out, delimiter=";")
    w.writerow(CSV_COLUMNS)
    with db() as conn:
        rows = conn.execute(
            "SELECT c.*, p.date AS p_date, p.brand, p.model, p.model_year, p.price, p.notes AS p_notes "
            "FROM customers c LEFT JOIN purchases p ON p.customer_id = c.id ORDER BY c.name, p.date"
        ).fetchall()
    for r in rows:
        w.writerow([r["name"], r["phone"] or "", r["email"] or "", r["city"] or "", r["address"] or "",
                    r["birth_date"] or "", r["preferred_channel"] or "", r["p_date"] or "", r["brand"] or "",
                    r["model"] or "", r["model_year"] or "", f"{r['price']:.0f}" if r["price"] else "",
                    r["p_notes"] or ""])
    name = f"customer-list-{date.today().isoformat()}.csv"
    return Response("﻿" + out.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


@app.post("/api/demo")
def load_demo():
    """Five sample customers to try the app with."""
    t = date.today()

    def ago(y: float, extra_days: int = 0) -> str:
        return (t - timedelta(days=round(y * 365.25) + extra_days)).isoformat()

    demo = [
        # buys a car every 3 years, last one ~3 years ago -> call now
        ({"name": "Ahmet Yılmaz", "phone": "0532 111 22 33", "city": "Nicosia", "address": "Göçmenköy",
          "birth_date": (t + timedelta(days=12)).replace(year=1978).isoformat()},
         [(ago(9), "Toyota", "Corolla", 950000), (ago(6), "Toyota", "C-HR", 1300000), (ago(3, 15), "Toyota", "RAV4", 1900000)]),
        # one car 10 years ago -> long past the default cycle
        ({"name": "Ayşe Demir", "phone": "0533 444 55 66", "city": "Kyrenia"},
         [(ago(10), "Renault", "Clio", 450000)]),
        # VIP: many purchases, high spend -> home visit + gift
        ({"name": "Mehmet Kaya", "phone": "0542 777 88 99", "city": "Famagusta", "address": "Sakarya District",
          "preferred_channel": "visit"},
         [(ago(8), "BMW", "320i", 1800000), (ago(6), "BMW", "520d", 2600000),
          (ago(4), "Mercedes", "E200", 3100000), (ago(2, -30), "BMW", "X5", 4800000)]),
        # bought recently -> on track
        ({"name": "Elif Şahin", "phone": "0548 222 33 44", "city": "Nicosia"},
         [(ago(0.5), "Hyundai", "i20", 900000)]),
        # 2 purchases 4 years apart, last 3.7 years ago -> due soon
        ({"name": "Can Öztürk", "phone": "0533 999 00 11", "city": "Morphou", "preferred_channel": "message"},
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
