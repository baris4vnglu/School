# 🚗 Oto CRM — Müşteri Geçmişi & Yenileme Takibi

Araba galerisi için **lokal** çalışan web uygulaması. Müşterinin hangi aracı ne zaman aldığını tutar,
alım alışkanlığından **bir sonraki araç değiştirme zamanını** tahmin eder ve
"**bu müşteriyi ara / evine git / hediye gönder**" diye öneri verir.

Örnekler:
- Müşteri **3 senede bir** araba almış, 3 kez almış, sonuncusu **3 yıl önce** → *Yenileme zamanı geldi, ara.*
- Müşteri **10 yıl önce** tek araba almış → *Varsayılan süre (5 yıl) çoktan geçti, takas teklifiyle ara.*
- Çok alım yapmış / yüksek harcamalı **VIP** müşteri → *Ev/iş yeri ziyareti + hediye.*

Veriler sadece kendi bilgisayarınızdaki `data/crm.db` (SQLite) dosyasında durur, internet gerekmez.

## Akış (tahtadaki şema)

```
Product (satılan araç) ──► Customer (müşteri + alım geçmişi)
                                │
                          Analysis — ortalama değiştirme süresi, beklenen tarih, öncelik puanı
                                │
                          Lead — "Aranacaklar" listesi
                                │
          Comm. (ara / ziyaret / hediye / davet) · Content (konuşma metni) · Media (telefon, WhatsApp, e-posta)
                                │
                     Görüşme sonucu tekrar Customer'a kaydedilir (geri bildirim)
```

## Çalıştırma (tek tık)

1. [Python 3.10+](https://www.python.org/downloads/) kurun (Windows'ta "Add to PATH" seçili olsun).
2. `oto-crm` klasöründe **Windows:** `baslat.bat` çift tıklayın · **Mac/Linux:** `./baslat.sh`
3. Tarayıcıda **http://localhost:8001** açılır.

Elle:

```bash
cd oto-crm
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.app:app --reload --port 8001
```

## Kullanım

1. İlk deneme için **Ayarlar → Örnek veri yükle**.
2. **Müşteriler → + Yeni Müşteri** ile müşteri ekleyin, açılan panelden aldığı araçları (tarih, marka, model, fiyat) girin.
   Mevcut kayıtlarınız varsa **Ayarlar → CSV içe aktar** (`ad, telefon, tarih, marka, model, fiyat`).
3. **Aranacaklar** sekmesi her gün kimi aramanız gerektiğini öncelik sırasıyla gösterir.
4. Müşteriye tıklayın: analiz, önerilen iletişim şekli, hazır konuşma metni.
5. Görüştükten sonra **Görüşmeyi kaydet** (kanal, sonuç, istenirse "tekrar ulaş" tarihi). Görüşülen müşteri
   bir süre listede geri plana düşer; "tekrar ulaş" tarihi verilirse o tarihe kadar ertelenir.

## Nasıl karar veriyor?

| Adım | Kural |
|---|---|
| Değiştirme süresi | 2+ alım varsa alımlar arası **ortalama süre**; tek alımda varsayılan **5 yıl** (Ayarlar'dan değişir) |
| Beklenen tarih | Son alım tarihi + değiştirme süresi |
| Durum | Geçmiş → **Gecikmiş** (kırmızı) · 180 gün içinde → **Yaklaşıyor** (turuncu) · değilse **Takipte** |
| Segment | 3+ alım veya 3.000.000 TL+ → **VIP** · 2 alım → **Sadık** · 1 alım → **Tek alım** |
| Öncelik (0-100) | Zamanlama (60) + sadakat (25) + harcama (15); son 30 günde görüşüldüyse düşürülür, doğum günü yaklaşıyorsa artar |
| İletişim | VIP → ziyaret + hediye + randevu için telefon · Sadık → telefon + test sürüşü daveti + küçük hediye · Tek alım → telefon (takas teklifi) + WhatsApp/SMS · Erken → WhatsApp/e-posta ile ilişkiyi sıcak tut · Müşterinin tercih ettiği kanal hep en başta |

Kurallar `backend/app.py` içindeki `analyze()` fonksiyonundadır, kolayca değiştirilebilir.
