# 🚗 Auto CRM — Customer History & Upgrade Tracking

A web app for car dealerships that runs **locally** on your own computer. It keeps track of which car each customer
bought and when, predicts **when they are likely to change cars** from their buying habit, and tells you
**"call this customer / visit them at home / send a gift"**. It also includes a **30-second ad video** that can be
personalised for each customer.

Examples:
- A customer buys a car **every 3 years**, has bought 3 times, the last one **3 years ago** → *Time to upgrade, call now.*
- A customer bought one car **10 years ago** → *Long past the default cycle (5 years), call with a trade-in offer.*
- A **VIP** customer with many purchases / high spend → *Home or office visit + a gift.*

Data stays in `data/crm.db` (SQLite) on your computer. No internet connection is needed.

## Flow (from the whiteboard)

```
Product (car sold) ──► Customer (customer + purchase history)
                              │
                        Analysis — average replacement cycle, expected date, priority score
                              │
                        Lead — "To Contact" list
                              │
        Comm. (call / visit / gift / invite) · Content (call script, message) · Media (30-second ad video, WhatsApp, email)
                              │
                 The outcome of each contact is saved back to the Customer (feedback)
```

## Getting started (one click)

1. Install [Python 3.10+](https://www.python.org/downloads/) (on Windows, tick "Add to PATH").
2. In the `auto-crm` folder, **Windows:** double-click `start.bat` · **Mac/Linux:** run `./start.sh`
3. Your browser opens **http://localhost:8001**.

Manually:

```bash
cd auto-crm
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.app:app --reload --port 8001
```

## How to use it

1. **Settings → Dealership:** enter your dealership's name, phone and address (used in the call script and the ad video).
2. To try it out: **Settings → Load ready-made list** (32 customers, 67 purchases: `sample-data/customer-list.csv`).
3. **Your own customer list:** save it from Excel as *CSV UTF-8* and upload it with **Settings → Import**
   (a blank template can be downloaded from the same screen). To add customers one by one: **Customers → + New Customer**.
4. The **To Contact** tab shows who to contact today, in priority order.
5. Click a customer to see the analysis, the recommended way to contact them and a ready-made call script.
6. After the contact, click **Log contact** (channel, outcome and an optional follow-up date). A contacted customer moves
   down the list for a while; with a follow-up date they are snoozed until that date.

## Media: 30-second ad video

The **Media** tab plays a 30-second ad with music:
*brand intro → "Driving the same car for 3+ years?" → "Trade it in at top value" → three benefits → your phone number and address.*

- **Personalise:** pick a customer (or click **🎬 Personalised ad video** in the customer's panel) and the video says
  *"Ahmet, your Toyota RAV4 is 3 years old."* and *"Ahmet, visit … this week"*. A matching WhatsApp message is ready to copy.
- **Download this video:** records the video in your browser (it plays once, 30 seconds). Chrome or Edge save an
  **MP4** that plays on every phone; other browsers save WebM.
- **Ready-made general video:** `frontend/media/ad-30s.mp4` (1280×720, H.264 + AAC) with placeholder dealership details.
  To render it with your own details (needs Node.js, Playwright and ffmpeg):

  ```bash
  node tools/render-ad.js --dealer "Kaya Motors" --phone "+90 392 444 12 34" --address "Main Street 1, Nicosia"
  ```

## Customer list format (CSV)

Each row is one car purchase; the same **name + phone** counts as one customer. The separator can be `;` or `,`,
and Excel's Turkish encoding (Windows-1254) is also read. A purchase is never added twice, so you can update the same
file and upload it again. The Turkish column names from the earlier version (`ad`, `telefon`, `tarih`…) are still accepted.

| Column | Required | Example |
|---|---|---|
| `name` | ✔ | Ahmet Yılmaz |
| `purchase_date` | for a purchase | `20.05.2019` or `2019-05-20` — if empty, only the customer (a prospect) is added |
| `phone`, `email`, `city`, `address` | | 0533 111 22 33 |
| `birth_date` | | 15.04.1980 |
| `preferred_channel` | | `phone`, `visit`, `gift`, `message`, `video`, `email`, `invite` |
| `brand`, `model`, `model_year` | | Toyota, Corolla, 2019 |
| `price` | | `1.250.000` or `1250000` |
| `notes` | | Trade-in |

**Settings → Download customer list** exports everything in the same format (for backups or to open in Excel).

## How it decides

| Step | Rule |
|---|---|
| Replacement cycle | With 2+ purchases, the **average time between purchases**; for one purchase, a default of **5 years** (changeable in Settings) |
| Expected date | Last purchase date + replacement cycle |
| Status | Past → **Overdue** (red) · within 180 days → **Due soon** (orange) · otherwise **On track** |
| Segment | 3+ purchases or 3,000,000 TL+ → **VIP** · 2 purchases → **Loyal** · 1 purchase → **One-time** |
| Priority (0-100) | Timing (60) + loyalty (25) + spend (15); lowered if contacted in the last 30 days, raised if their birthday is coming up |
| Contact | VIP → visit + gift + call to book it · Loyal → call + personalised video + test drive invite + small gift · One-time → call (trade-in offer) + video on WhatsApp + showroom invite · Early → keep in touch by WhatsApp/email · The customer's preferred channel always comes first |

The rules live in the `analyze()` function in `backend/app.py` and are easy to change.
