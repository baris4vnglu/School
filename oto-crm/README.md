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

1. İlk deneme için **Ayarlar → Hazır listeyi yükle** (32 müşteri, 67 araç alımı: `ornek-veri/musteri-listesi.csv`).
2. **Kendi müşteri listeniz:** Excel'de listeyi *CSV UTF-8* olarak kaydedip **Ayarlar → İçe aktar** ile yükleyin
   (boş şablon aynı ekrandan indirilir). Tek tek eklemek için **Müşteriler → + Yeni Müşteri**.
3. **Aranacaklar** sekmesi her gün kimi aramanız gerektiğini öncelik sırasıyla gösterir.
4. Müşteriye tıklayın: analiz, önerilen iletişim şekli, hazır konuşma metni.
5. Görüştükten sonra **Görüşmeyi kaydet** (kanal, sonuç, istenirse "tekrar ulaş" tarihi). Görüşülen müşteri
   bir süre listede geri plana düşer; "tekrar ulaş" tarihi verilirse o tarihe kadar ertelenir.

## Müşteri listesi formatı (CSV)

Her satır bir araç alımıdır; aynı **ad + telefon** tek müşteri sayılır. Ayırıcı `;` veya `,` olabilir,
Excel'in Türkçe kodlaması (Windows-1254) da okunur. Aynı alım iki kez eklenmez, yani aynı dosyayı güncelleyip tekrar yükleyebilirsiniz.

| Sütun | Zorunlu | Örnek |
|---|---|---|
| `ad` | ✔ | Ahmet Yılmaz |
| `tarih` (alış tarihi) | alım için | `20.05.2019` veya `2019-05-20` — boşsa sadece müşteri (aday) eklenir |
| `telefon`, `eposta`, `sehir`, `adres` | | 0533 111 22 33 |
| `dogum_tarihi` | | 15.04.1980 |
| `tercih` | | `telefon`, `ziyaret`, `hediye`, `whatsapp`, `eposta`, `davet` |
| `marka`, `model`, `model_yili` | | Toyota, Corolla, 2019 |
| `fiyat` | | `1.250.000` veya `1250000` |
| `not` | | Takasla |

**Ayarlar → Müşteri listesini indir** tüm veriyi aynı formatta dışa aktarır (yedek almak veya Excel'de açmak için).

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
