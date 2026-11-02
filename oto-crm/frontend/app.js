// Oto CRM - arayüz
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let META = { channels: {}, outcomes: {} };
let currentId = null;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (x) => (x == null ? "-" : Number(x).toLocaleString("tr-TR") + " TL");
const dt = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("tr-TR") : "-");
const today = () => new Date().toISOString().slice(0, 10);

async function api(path, opts = {}) {
  const o = { ...opts };
  if (o.body && !(o.body instanceof FormData)) {
    o.headers = { "Content-Type": "application/json" };
    o.body = JSON.stringify(o.body);
  }
  const r = await fetch("/api" + path, o);
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).detail || msg; } catch {}
    toast("Hata: " + (typeof msg === "string" ? msg : JSON.stringify(msg)));
    throw new Error(msg);
  }
  return r.json();
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2500);
}

function channelOptions(optional) {
  return (optional ? `<option value="">— Fark etmez —</option>` : "") +
    Object.entries(META.channels).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
}
const outcomeOptions = () => Object.entries(META.outcomes).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
const segBadge = (s) => `<span class="badge ${esc(s.split(" ")[0])}">${esc(s)}</span>`;
const carName = (p) => (p ? `${p.brand || ""} ${p.model || ""}`.trim() || "Araç" : "-");

// ---------------------------------------------------------------- Sekmeler
$$("nav button").forEach((b) =>
  b.addEventListener("click", () => {
    $$("nav button").forEach((x) => x.classList.toggle("active", x === b));
    $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
    refresh();
  })
);
const activeTab = () => $("nav button.active").dataset.tab;
function refresh() {
  const t = activeTab();
  if (t === "leads") loadLeads();
  if (t === "customers") loadCustomers();
  if (t === "settings") loadSettings();
}

// ---------------------------------------------------------------- Aranacaklar
async function loadLeads() {
  const { stats, leads } = await api("/leads");
  $("#stats").innerHTML = `
    <div class="stat"><b>${stats.customers}</b><span>Toplam müşteri</span></div>
    <div class="stat red"><b>${stats.gecikmis}</b><span>Yenileme zamanı geçmiş</span></div>
    <div class="stat orange"><b>${stats.yaklasiyor}</b><span>Yenileme zamanı yaklaşıyor</span></div>
    <div class="stat gold"><b>${stats.vip}</b><span>VIP müşteri</span></div>`;
  if (!leads.length) {
    $("#leads").innerHTML = `<div class="empty">Şu an aranması gereken müşteri yok.<br>
      Müşteri eklemek için <b>Müşteriler</b> sekmesine gidin veya <b>Ayarlar → Örnek veri yükle</b> ile deneyin.</div>`;
    return;
  }
  $("#leads").innerHTML = leads.map(({ customer: c, analysis: a }) => `
    <div class="card ${a.status}">
      <div class="card-head">
        <div>
          <h3>${esc(c.name)} ${segBadge(a.segment)}</h3>
          <div class="sub">📞 ${esc(c.phone || "-")} ${c.city ? "· 📍 " + esc(c.city) : ""}</div>
        </div>
        <span class="score" title="Öncelik puanı">${a.score}/100</span>
      </div>
      <div class="st ${a.status}">${esc(a.status_label)}</div>
      <div class="sub">Son araç: <b>${esc(carName(a.last_purchase))}</b> (${dt(a.last_purchase.date)}) ·
        ${a.purchase_count} alım · ort. ${a.cycle_years} yılda bir</div>
      <div class="actions-list">${a.actions.map((x) => `<span class="chip" title="${esc(x.why)}">${esc(x.label)}</span>`).join("")}</div>
      <div><button class="small primary" data-open="${c.id}">Detay &amp; görüşme kaydet</button></div>
    </div>`).join("");
}

// ---------------------------------------------------------------- Müşteriler
async function loadCustomers() {
  const q = $("#search").value.trim();
  const items = await api("/customers?q=" + encodeURIComponent(q));
  $("#customer-rows").innerHTML = items.length
    ? items.map(({ customer: c, analysis: a }) => `
      <tr data-open="${c.id}">
        <td><b>${esc(c.name)}</b></td>
        <td>${esc(c.phone || "-")}</td>
        <td>${esc(c.city || "-")}</td>
        <td>${a.purchase_count}</td>
        <td>${esc(carName(a.last_purchase))}</td>
        <td>${segBadge(a.segment)}</td>
        <td><span class="st ${a.status}">${esc(a.status_label)}</span></td>
      </tr>`).join("")
    : `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Kayıt yok</td></tr>`;
}
let searchTimer;
$("#search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadCustomers, 200); });

document.addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]");
  if (o) openCustomer(+o.dataset.open);
  if (e.target.closest("[data-close]")) closeDrawer();
});

// ---------------------------------------------------------------- Müşteri formu
const dlg = $("#customer-dialog");
const cform = $("#customer-form");
let editingId = null;

function openCustomerForm(c = null) {
  editingId = c ? c.id : null;
  $("#customer-form-title").textContent = c ? "Müşteriyi Düzenle" : "Yeni Müşteri";
  cform.reset();
  if (c) for (const [k, v] of Object.entries(c)) if (cform.elements[k]) cform.elements[k].value = v ?? "";
  dlg.showModal();
}
$("#btn-new").addEventListener("click", () => openCustomerForm());
cform.addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "save") return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(cform));
  for (const k in data) if (data[k] === "") data[k] = null;
  if (editingId) {
    await api("/customers/" + editingId, { method: "PUT", body: data });
    dlg.close();
    toast("Kaydedildi");
    openCustomer(editingId);
  } else {
    const { id } = await api("/customers", { method: "POST", body: data });
    dlg.close();
    toast("Müşteri eklendi — şimdi aldığı araçları girin");
    openCustomer(id);
  }
  refresh();
});

// ---------------------------------------------------------------- Detay paneli
function closeDrawer() { $("#drawer").classList.add("hidden"); currentId = null; refresh(); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !dlg.open) closeDrawer(); });

async function openCustomer(id) {
  currentId = id;
  const { customer: c, purchases, contacts, analysis: a } = await api("/customers/" + id);
  const pct = a.days_left != null ? Math.max(3, Math.min(100, 100 - (a.days_left / (a.cycle_years * 365.25)) * 100)) : 0;

  $("#drawer-body").innerHTML = `
    <h2>${esc(c.name)} ${segBadge(a.segment)}</h2>
    <div class="muted">📞 ${esc(c.phone || "-")} · ✉️ ${esc(c.email || "-")} · 📍 ${esc([c.address, c.city].filter(Boolean).join(", ") || "-")}
      ${c.birth_date ? " · 🎂 " + dt(c.birth_date) : ""}
      ${c.preferred_channel ? " · Tercih: " + esc(META.channels[c.preferred_channel] || c.preferred_channel) : ""}</div>
    ${c.notes ? `<p>${esc(c.notes)}</p>` : ""}
    <p><button class="small" id="btn-edit">Düzenle</button> <button class="small danger" id="btn-del">Müşteriyi sil</button></p>

    <div class="section">
      <h4 style="margin-top:0">📊 Analiz <span class="score" style="float:right">Öncelik ${a.score}/100</span></h4>
      ${a.purchase_count ? `
        <div class="st ${a.status}">${esc(a.status_label)}</div>
        <div class="timeline-bar"><div class="${a.status}" style="width:${pct}%"></div></div>
        <div class="muted" style="font-size:12px">Son alım ${dt(a.last_purchase.date)} → beklenen yenileme ${dt(a.expected_date)}</div>
        <ul>${a.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
        : `<p class="muted">Analiz için önce aşağıdan aldığı aracı ekleyin.</p>`}
    </div>

    ${a.actions.length ? `
    <div class="section">
      <h4 style="margin-top:0">🤝 Önerilen iletişim</h4>
      ${a.actions.map((x) => `<div class="rec"><b>${esc(x.label)}</b><span>${esc(x.why)}</span></div>`).join("")}
    </div>` : ""}

    ${a.script ? `
    <div class="section">
      <h4 style="margin-top:0">🗣️ Ne söyleyelim? <button class="small" id="btn-copy" style="float:right">Kopyala</button></h4>
      <div class="script" id="script">${esc(a.script)}</div>
    </div>` : ""}

    <div class="section">
      <h4 style="margin-top:0">🚗 Satın aldığı araçlar</h4>
      <table class="mini">
        <tr><th>Tarih</th><th>Araç</th><th>Model yılı</th><th>Fiyat</th><th></th></tr>
        ${purchases.map((p) => `<tr><td>${dt(p.date)}</td><td>${esc(carName(p))}</td><td>${esc(p.model_year || "-")}</td>
          <td>${money(p.price)}</td><td><button class="small danger" data-del-p="${p.id}">Sil</button></td></tr>`).join("") ||
          `<tr><td colspan="5" class="muted">Kayıt yok</td></tr>`}
      </table>
      <form class="inline" id="purchase-form">
        <label>Alış tarihi<input name="date" type="date" required></label>
        <label>Marka<input name="brand" required></label>
        <label>Model<input name="model"></label>
        <label>Model yılı<input name="model_year" type="number" min="1950" max="2100"></label>
        <label>Fiyat (TL)<input name="price" type="number" min="0" step="1000"></label>
        <button class="primary">+ Araç ekle</button>
      </form>
    </div>

    <div class="section">
      <h4 style="margin-top:0">📝 Görüşme geçmişi</h4>
      <table class="mini">
        <tr><th>Tarih</th><th>Kanal</th><th>Sonuç</th><th>Not</th><th>Tekrar</th><th></th></tr>
        ${contacts.slice().reverse().map((x) => `<tr><td>${dt(x.date)}</td><td>${esc(META.channels[x.channel] || x.channel)}</td>
          <td>${esc(META.outcomes[x.outcome] || x.outcome || "-")}</td><td>${esc(x.notes || "")}</td>
          <td>${x.next_contact_date ? dt(x.next_contact_date) : "-"}</td>
          <td><button class="small danger" data-del-c="${x.id}">Sil</button></td></tr>`).join("") ||
          `<tr><td colspan="6" class="muted">Henüz görüşme yok</td></tr>`}
      </table>
      <form class="inline" id="contact-form">
        <label>Tarih<input name="date" type="date" value="${today()}"></label>
        <label>Kanal<select name="channel">${channelOptions(false)}</select></label>
        <label>Sonuç<select name="outcome">${outcomeOptions()}</select></label>
        <label>Tekrar ulaş (ops.)<input name="next_contact_date" type="date"></label>
        <label style="grid-column:1/-1">Not<input name="notes" placeholder="Ne konuşuldu, ne hediye gönderildi…"></label>
        <button class="primary">+ Görüşmeyi kaydet</button>
      </form>
    </div>`;

  if (a.actions[0]) $("#contact-form").elements.channel.value = a.actions[0].channel;
  $("#drawer").classList.remove("hidden");

  $("#btn-edit").onclick = () => openCustomerForm(c);
  $("#btn-del").onclick = async () => {
    if (!confirm(`${c.name} ve tüm geçmişi silinsin mi?`)) return;
    await api("/customers/" + id, { method: "DELETE" });
    toast("Silindi");
    closeDrawer();
  };
  const copy = $("#btn-copy");
  if (copy) copy.onclick = () => navigator.clipboard.writeText(a.script).then(() => toast("Kopyalandı"));

  $("#purchase-form").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    for (const k in d) if (d[k] === "") d[k] = null;
    await api(`/customers/${id}/purchases`, { method: "POST", body: d });
    toast("Araç eklendi");
    openCustomer(id);
  };
  $("#contact-form").onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    for (const k in d) if (d[k] === "") d[k] = null;
    await api(`/customers/${id}/contacts`, { method: "POST", body: d });
    toast("Görüşme kaydedildi");
    openCustomer(id);
  };
  $$("[data-del-p]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Bu alım kaydı silinsin mi?")) return;
    await api("/purchases/" + b.dataset.delP, { method: "DELETE" });
    openCustomer(id);
  }));
  $$("[data-del-c]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Bu görüşme kaydı silinsin mi?")) return;
    await api("/contacts/" + b.dataset.delC, { method: "DELETE" });
    openCustomer(id);
  }));
}

// ---------------------------------------------------------------- Ayarlar
async function loadSettings() {
  const s = await api("/settings");
  const f = $("#settings-form");
  for (const [k, v] of Object.entries(s)) if (f.elements[k]) f.elements[k].value = v;
}
$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = Object.fromEntries([...new FormData(e.target)].map(([k, v]) => [k, Number(v)]));
  await api("/settings", { method: "PUT", body: d });
  toast("Ayarlar kaydedildi");
});
$("#btn-demo").addEventListener("click", async () => {
  await api("/demo", { method: "POST" });
  toast("Örnek veriler yüklendi");
  $('nav button[data-tab="leads"]').click();
});
$("#btn-import").addEventListener("click", async () => {
  const file = $("#csv").files[0];
  if (!file) return toast("Önce bir CSV dosyası seçin");
  const fd = new FormData();
  fd.append("file", file);
  const r = await api("/import", { method: "POST", body: fd });
  toast(`${r.customers} yeni müşteri, ${r.purchases} alım eklendi`);
});

// ---------------------------------------------------------------- Başlat
(async () => {
  META = await api("/meta");
  $$("select[data-channels]").forEach((s) => (s.innerHTML = channelOptions(s.dataset.channels === "optional")));
  refresh();
})();
