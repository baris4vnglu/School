# UZEBİM Asistan: Yakın Doğu Üniversitesi Öğrenci Sistemi için Yeniden Tasarım, Akademik Danışman Chatbotu ve Kampüs Konum Rehberi

## Proje Raporu – Sürüm 1

| | |
|---|---|
| Ders | [Ders kodu ve adı] |
| Öğretim Üyesi | [Hocanın adı] |
| Grup | [Grup adı / numarası] |
| Grup Üyeleri | [Ad Soyad – Öğrenci No] · [Ad Soyad – Öğrenci No] · [Ad Soyad – Öğrenci No] |
| Teslim Tarihi | 17/11/2026 |
| Sürüm | 1 (Ana fikir, genel giriş ve rapor bölümlerinin planı) |

# Özet

Yakın Doğu Üniversitesi'ne (YDÜ) her dönem binlerce yeni öğrenci kayıt yaptırmaktadır. Bu öğrenciler ilk haftalarında hep aynı sorularla karşılaşır: "Derse nasıl kayıt olurum?", "Bir dersi nasıl bırakırım?", "Danışmanım kim, onayını nasıl alırım?", "Dersim hangi binada?". Bugün bu soruların cevapları yönetmeliklere, duyurulara, danışman hocaların e-postalarına ve öğrenciler arasında dolaşan bilgilere dağılmış durumdadır. Ders işlemlerinin yapıldığı UZEBİM/DEBİM sistemi (debim.neu.edu.tr) ise bu süreçte öğrenciye yol gösterecek bir rehberlik sunmamaktadır.

Bu projede UZEBİM/DEBİM öğrenci arayüzü yeniden tasarlanacak ve içine iki yeni modül eklenecektir: (1) yeni öğrencilere ders ekleme/bırakma, kayıt yenileme ve danışmanlık süreçlerinde bir akademik danışman gibi rehberlik eden, yapay zekâ destekli bir **chatbot**; (2) fakültelerin, binaların ve dersliklerin yerini **Google Maps konum bağlantısı** ile gösteren bir **kampüs konum rehberi**. Chatbot, grubumuz tarafından hazırlanacak bir bilgi tabanından (yönetmelikler, sık sorulan sorular, danışman notları, bina ve derslik koordinatları) beslenecek ve yalnızca bu kaynaklara dayanarak cevap verecektir. Böylece öğrenci "MAT101 dersim nerede?" diye sorduğunda dersin binasını, katını ve sınıfını öğrenecek; tek dokunuşla telefonundaki Google Maps uygulamasında konuma yönlendirilecektir.

**Anahtar Kelimeler:** öğrenci bilgi sistemi, chatbot, akademik danışmanlık, RAG, kampüs navigasyonu, Google Maps, kullanıcı arayüzü tasarımı

# 1. Giriş

## 1.1 Problemin Tanımı

Üniversiteye yeni başlayan bir öğrenci için ilk dönem, yalnızca akademik değil idari açıdan da zorlayıcıdır. Öğrenci kısa bir süre içinde şunları öğrenmek zorundadır:

- Öğrenci sistemine nasıl giriş yapılacağı ve hangi ekranın ne işe yaradığı,
- Ders ekleme, ders bırakma ve ders değiştirme işlemlerinin nasıl ve hangi tarihler arasında yapılacağı,
- Ön koşullu dersler, kredi (AKTS) sınırları ve danışman onayı gibi kurallar,
- Danışman hocasının kim olduğu ve ona nasıl ulaşılacağı,
- Kampüste fakültelerin, binaların ve dersliklerin nerede olduğu.

Bu bilgiler bugün tek bir yerde bulunmamaktadır. Öğrenciler cevapları çoğunlukla danışman hocalarına e-posta atarak, öğrenci işleri ofisinde sıra bekleyerek ya da arkadaşlarına sorarak bulmaktadır. Bu durum hem öğrenciler hem de danışman hocalar için zaman kaybına yol açmakta; kayıt dönemlerinde danışmanlara aynı sorular tekrar tekrar sorulmaktadır. Kampüsün büyüklüğü nedeniyle yeni öğrencilerin ilk haftalarda derslik bulmakta zorlanması da sık karşılaşılan bir sorundur.

## 1.2 Motivasyon

Grubumuzun üyeleri de bu süreçleri yakın zamanda yaşamıştır. Kayıt dönemlerinde en çok sorulan soruların büyük kısmının birbirine benzediği ve yazılı kaynaklardan cevaplanabildiği görülmektedir. Bu tür tekrarlayan soruların bir chatbot tarafından günün her saatinde, anında ve tutarlı biçimde cevaplanması:

- Öğrencinin bilgiye ulaşma süresini kısaltır,
- Danışman hocaların iş yükünü azaltarak onların gerçekten kişisel ilgi gerektiren durumlara odaklanmasını sağlar,
- Uluslararası öğrencilere (Türkçe ve İngilizce) eşit erişim imkânı sunar.

## 1.3 Projenin Amacı

Projenin ana amacı, YDÜ öğrencilerinin ders işlemleri ve kampüs içi yön bulma konularındaki ihtiyaçlarını tek bir arayüzden karşılayan bir sistem tasarlamak ve prototipini geliştirmektir. Bu amaç doğrultusunda alt hedefler şunlardır:

1. UZEBİM/DEBİM öğrenci arayüzünü daha sade, anlaşılır ve mobil uyumlu hâle getiren yeni bir tasarım önermek.
2. Ders ekleme/bırakma, kayıt yenileme ve danışmanlık konularında soruları cevaplayan bir akademik danışman chatbotu geliştirmek.
3. Fakülte, bina ve dersliklerin konumlarını Google Maps bağlantısı ile gösteren bir kampüs konum rehberi oluşturmak.
4. Chatbot ile konum rehberini birleştirerek "dersim nerede?" sorusuna doğrudan konum bağlantısıyla cevap verebilmek.

## 1.4 Kapsam ve Sınırlar

**Kapsam dahilinde:**

- Öğrenci tarafı arayüz tasarımı (ana sayfa, derslerim, chatbot, kampüs rehberi ekranları),
- Bilgi tabanına dayalı soru-cevap chatbotu (Türkçe ve İngilizce),
- Bina ve derslik koordinatlarını içeren bir konum veri seti ve Google Maps bağlantıları,
- Çalışan bir web prototipi.

**Kapsam dışında:**

- Üniversitenin gerçek UZEBİM/DEBİM sistemine doğrudan entegrasyon (prototip ayrı bir uygulama olarak çalışacak; entegrasyon yolu raporda önerilecektir),
- Chatbot'un öğrenci adına ders ekleme/bırakma gibi işlem yapması (chatbot yalnızca yol gösterir),
- Öğrencilerin kişisel not, transkript gibi hassas verilerinin işlenmesi,
- 3 boyutlu kampüs modeli ve kampüs içi adım adım navigasyon (konum gösterimi ve yol tarifi Google Maps'e bırakılmıştır).

# 2. Ana Fikir: Önerilen Sistem

Önerilen sistem **"UZEBİM Asistan"**, mevcut öğrenci sisteminin yerine geçen değil, onu tamamlayan ve öğrenciye yol gösteren bir katmandır. Sistem üç ana modülden oluşur.

## 2.1 Modül 1 – Yeniden Tasarlanmış Öğrenci Arayüzü

Mevcut debim.neu.edu.tr arayüzü Moodle tabanlıdır ve yeni bir öğrenci için çok sayıda menü ve bağlantı içerir. Yeni tasarımda:

- Ana sayfada öğrencinin **bugünkü dersleri**, **yaklaşan önemli tarihler** (ekle-bırak haftası, sınavlar) ve **duyurular** tek bakışta görülür,
- Her ders kartında dersin **yeri** ve **"Haritada Aç"** düğmesi bulunur,
- Ekranın köşesinde her sayfadan erişilebilen bir **chatbot penceresi** yer alır,
- Tasarım mobil öncelikli (mobile-first) olarak hazırlanır, çünkü öğrenciler sisteme çoğunlukla telefondan erişmektedir.

## 2.2 Modül 2 – Akademik Danışman Chatbotu

Chatbot, yeni bir öğrencinin danışman hocasına sorabileceği soruları cevaplar. Örnek kullanım senaryoları:

| Öğrencinin sorusu | Chatbot'un cevabı |
|---|---|
| "Ders nasıl eklerim?" | Sistemdeki adımları sırayla anlatır, ekle-bırak tarihlerini hatırlatır, ilgili yönetmelik maddesini kaynak olarak gösterir. |
| "Bir dersi bırakırsam ne olur?" | Bırakma kurallarını, son tarihi ve kredi alt sınırını açıklar. |
| "MAT101'i almadan MAT102 alabilir miyim?" | Ön koşul kuralını açıklar, danışman onayı gerekiyorsa bunu belirtir. |
| "Danışmanım kim?" | Bölüme göre danışman bilgisini, ofisini ve ofis saatlerini verir. |
| "Mühendislik Fakültesi nerede?" | Binanın adını ve kısa tarifini verir, Google Maps bağlantısı ekler. |

Chatbot'un temel ilkeleri:

- **Kaynağa dayalı cevap:** Chatbot yalnızca bilgi tabanındaki belgelere dayanarak cevap verir ve cevabın kaynağını gösterir. Bu yaklaşım RAG (Retrieval-Augmented Generation – Erişimle Zenginleştirilmiş Üretim) olarak adlandırılır ve modelin bilgi uydurma riskini azaltır.
- **Bilmediğini söyleme:** Bilgi tabanında cevap yoksa chatbot tahmin yürütmez; öğrenciyi ilgili danışmana veya öğrenci işlerine yönlendirir.
- **İki dil:** Türkçe ve İngilizce sorular, sorunun dilinde cevaplanır.
- **İşlem yapmama:** Chatbot öğrenci adına kayıt işlemi yapmaz, yalnızca rehberlik eder.

## 2.3 Modül 3 – Kampüs Konum Rehberi (Google Maps Bağlantısı)

Kampüsteki her fakülte, bina ve önemli nokta (kütüphane, yemekhane, öğrenci işleri, revir vb.) için bir **konum kaydı** tutulur. Her kayıtta şu alanlar yer alır:

| Alan | Örnek |
|---|---|
| Kod | ENG |
| Ad | Mühendislik Fakültesi |
| Enlem / Boylam | [grup tarafından Google Maps'ten alınacak] |
| Kısa tarif | "Ana girişten girdikten sonra sağdaki büyük bina" |
| Derslikler | ENG-101, ENG-102 … (kat bilgisiyle) |

Konum, resmî Google Maps URL biçimi kullanılarak bir bağlantıya çevrilir:

`https://www.google.com/maps/search/?api=1&query=ENLEM,BOYLAM`

Yol tarifi için ise şu biçim kullanılır:

`https://www.google.com/maps/dir/?api=1&destination=ENLEM,BOYLAM`

Bu yöntemin avantajları:

- **API anahtarı ve ücret gerektirmez,** yalnızca bağlantı oluşturulur.
- Telefonda bağlantıya dokunulduğunda **Google Maps uygulaması doğrudan açılır**; öğrenci yol tarifini alışık olduğu uygulamadan alır.
- Konum verisi basit bir tablo olduğundan **bakımı kolaydır**; yeni bina eklemek tek bir satır eklemekten ibarettir.

Derslik bilgisi bina kaydına bağlı olduğu için, öğrenci "Dersim ENG-204'te, orası neresi?" diye sorduğunda chatbot "Mühendislik Fakültesi, 2. kat" cevabını ve binanın Google Maps bağlantısını birlikte verir. Projenin en önemli özelliği, chatbot ile konum rehberinin bu şekilde birleşmesidir.

## 2.4 Sistemin Genel Akışı

1. Öğrenci yeni arayüze giriş yapar ve chatbot penceresine sorusunu yazar.
2. Sistem sorunun konusunu belirler (ders işlemi, danışman bilgisi veya konum).
3. Bilgi tabanında soruyla en ilgili belgeler bulunur.
4. Dil modeli yalnızca bu belgeleri kullanarak cevabı oluşturur.
5. Soru bir konumla ilgiliyse cevaba ilgili binanın Google Maps bağlantısı eklenir.
6. Cevap, kaynaklarıyla birlikte öğrenciye gösterilir; öğrenci cevabı 👍/👎 ile değerlendirebilir.

# 3. Rapor Bölümleri ve İçerik Planı

Bu bölümde nihai raporda yer alacak bölümler ve her bölümde yazılacak içerik listelenmiştir. Sürüm 1'de Giriş (Bölüm 1) ve Ana Fikir (Bölüm 2) tamamlanmıştır; aşağıdaki başlıklar sonraki sürümlerde yazılacak ve nihai raporda ayrı bölümler olarak yer alacaktır.

## 3.1 Mevcut Sistemin Analizi

- debim.neu.edu.tr (Moodle) ve UZEBİM öğrenci ekranlarının incelenmesi, ekran görüntüleriyle anlatılması,
- Yeni öğrencinin ders ekleme/bırakma sürecinin adım adım çıkarılması,
- Tespit edilen sorunlar (karmaşık menüler, rehberlik eksikliği, mobil kullanım zorlukları, bilgiye ulaşma süresi),
- Öğrencilere uygulanacak kısa bir anket ile en sık sorulan soruların ve sorunların belirlenmesi.

## 3.2 Benzer Çalışmalar (Literatür)

- Üniversitelerde kullanılan öğrenci destek chatbotları ve elde edilen sonuçlar,
- RAG yaklaşımı ve eğitimde kullanımı,
- Kampüs navigasyon uygulamaları,
- Bu çalışmaların projemizle karşılaştırılması.

## 3.3 Gereksinim Analizi

- İşlevsel gereksinimler (soru sorma, kaynak gösterme, konum bağlantısı verme, iki dil desteği, geri bildirim),
- İşlevsel olmayan gereksinimler (cevap süresi, mobil uyumluluk, erişilebilirlik, gizlilik),
- Kullanıcı rolleri: öğrenci, danışman/yönetici (bilgi tabanını güncelleyen kişi),
- Kullanım durumu (use-case) diyagramı.

## 3.4 Sistem Mimarisi ve Kullanılacak Teknolojiler

- Genel mimari diyagramı (arayüz → sunucu → bilgi tabanı → dil modeli),
- Ön yüz: HTML/CSS/JavaScript (gerekirse React),
- Sunucu: Python (FastAPI),
- Bilgi tabanı: belgelerin parçalara ayrılması ve vektör veri tabanında saklanması (ör. ChromaDB),
- Dil modeli seçimi: bulut tabanlı bir model ile yerel (Ollama) bir modelin maliyet, gizlilik ve Türkçe başarımı açısından karşılaştırılması,
- Konum modülü: JSON/CSV konum tablosu ve Google Maps URL oluşturma,
- UZEBİM/DEBİM ile gelecekte nasıl entegre edilebileceği (Moodle eklentisi önerisi).

## 3.5 Bilgi Tabanı ve Veri Hazırlama

- Toplanacak kaynaklar: öğrenci yönetmeliği, akademik takvim, ders kataloğu ve ön koşullar, danışman listesi, sık sorulan sorular, danışman hocalarla yapılacak görüşmelerden çıkarılan notlar,
- Bina ve derslik konum veri seti (koordinatların Google Maps'ten toplanması),
- Verinin formatı, temizlenmesi ve güncel tutulması,
- Veri gizliliği: kişisel öğrenci verisinin bilgi tabanına alınmaması.

## 3.6 Arayüz Tasarımı

- Kullanıcı akış diyagramları,
- Ekran taslakları (wireframe): ana sayfa, derslerim, chatbot penceresi, kampüs rehberi,
- Mevcut ekranlar ile yeni tasarımın karşılaştırılması,
- Renk, tipografi ve erişilebilirlik kararları.

## 3.7 Uygulama (Prototip)

- Prototipin geliştirilme adımları,
- Önemli kod parçalarının açıklanması (bilgi tabanından arama, cevap üretme, konum bağlantısı oluşturma),
- Örnek ekran görüntüleri ve örnek sohbetler.

## 3.8 Test ve Değerlendirme

- Hazırlanacak bir soru setiyle (ör. 50 soru) chatbot cevaplarının doğruluğunun ölçülmesi,
- Konum bağlantılarının doğruluğunun kontrolü,
- Bir grup öğrenciyle kullanılabilirlik testi ve anket sonuçları,
- Cevap süresi ölçümleri.

## 3.9 Sonuç ve Gelecek Çalışmalar

- Elde edilen sonuçların özeti,
- Gelecekte eklenebilecek özellikler: UZEBİM/DEBİM'e doğrudan entegrasyon, öğrencinin ders programından otomatik "bugünkü rotam" listesi, önemli tarihler için bildirimler, sesli soru sorma, bilgi tabanının danışmanlar tarafından bir yönetim paneliyle güncellenmesi.

## 3.10 Kaynaklar

- Kaynaklar sonraki sürümlerde IEEE/APA biçiminde eklenecektir.

# 4. Proje Planı ve Görev Dağılımı

| Hafta / Tarih | Çalışma | Sorumlu |
|---|---|---|
| 17/11/2026 | Sürüm 1: ana fikir, giriş, bölüm planı | Tüm grup |
| 2. hafta | Mevcut sistem analizi, öğrenci anketi | [Üye adı] |
| 3. hafta | Bilgi tabanı verilerinin toplanması (yönetmelik, SSS, danışman notları) | [Üye adı] |
| 3. hafta | Bina/derslik konum veri setinin hazırlanması | [Üye adı] |
| 4. hafta | Arayüz taslakları (wireframe) | [Üye adı] |
| 5.–6. hafta | Chatbot ve konum modülünün prototipi | [Üye adı] |
| 7. hafta | Test, değerlendirme ve anket | Tüm grup |
| 8. hafta | Nihai rapor ve sunum | Tüm grup |
