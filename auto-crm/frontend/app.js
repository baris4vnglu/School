// Auto CRM - user interface
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let META = { channels: {}, outcomes: {} };
let SETTINGS = {};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (x) => (x == null ? "-" : Number(x).toLocaleString("en-GB") + " TL");
const dt = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-");
const today = () => new Date().toISOString().slice(0, 10);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

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
    toast("Error: " + (typeof msg === "string" ? msg : JSON.stringify(msg)));
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
  return (optional ? `<option value="">— No preference —</option>` : "") +
    Object.entries(META.channels).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
}
const outcomeOptions = () => Object.entries(META.outcomes).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
const segBadge = (s) => `<span class="badge ${esc(s)}">${esc(s)}</span>`;
const carName = (p) => (p ? `${p.brand || ""} ${p.model || ""}`.trim() || "Car" : "-");

// ---------------------------------------------------------------- Tabs
function showTab(name) {
  $$("nav button").forEach((x) => x.classList.toggle("active", x.dataset.tab === name));
  $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + name));
  if (name !== "media") Ad.pause();
  refresh();
}
$$("nav button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
const activeTab = () => $("nav button.active").dataset.tab;
function refresh() {
  const t = activeTab();
  if (t === "leads") loadLeads();
  if (t === "customers") loadCustomers();
  if (t === "media") loadMedia();
  if (t === "settings") loadSettings();
}

// ---------------------------------------------------------------- To contact (leads)
async function loadLeads() {
  const { stats, leads } = await api("/leads");
  $("#stats").innerHTML = `
    <div class="stat"><b>${stats.customers}</b><span>Customers</span></div>
    <div class="stat red"><b>${stats.overdue}</b><span>Replacement overdue</span></div>
    <div class="stat orange"><b>${stats.due_soon}</b><span>Replacement due soon</span></div>
    <div class="stat gold"><b>${stats.vip}</b><span>VIP customers</span></div>`;
  if (!leads.length) {
    $("#leads").innerHTML = `<div class="empty">Nobody needs a call right now.<br>
      Add customers in the <b>Customers</b> tab, or try it out with <b>Settings → Load ready-made list</b>.</div>`;
    return;
  }
  $("#leads").innerHTML = leads.map(({ customer: c, analysis: a }) => `
    <div class="card ${a.status}">
      <div class="card-head">
        <div>
          <h3>${esc(c.name)} ${segBadge(a.segment)}</h3>
          <div class="sub">📞 ${esc(c.phone || "-")} ${c.city ? "· 📍 " + esc(c.city) : ""}</div>
        </div>
        <span class="score" title="Priority score">${a.score}/100</span>
      </div>
      <div class="st ${a.status}">${esc(a.status_label)}</div>
      <div class="sub">Current car: <b>${esc(carName(a.last_purchase))}</b> (${dt(a.last_purchase.date)}) ·
        ${plural(a.purchase_count, "purchase")} · changes every ${a.cycle_years} yrs</div>
      <div class="actions-list">${a.actions.map((x) => `<span class="chip" title="${esc(x.why)}">${esc(x.label)}</span>`).join("")}</div>
      <div><button class="small primary" data-open="${c.id}">Details &amp; log contact</button></div>
    </div>`).join("");
}

// ---------------------------------------------------------------- Customers
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
    : `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">No customers</td></tr>`;
}
let searchTimer;
$("#search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadCustomers, 200); });

document.addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]");
  if (o) openCustomer(+o.dataset.open);
  const v = e.target.closest("[data-video]");
  if (v) { closeDrawer(false); openMediaFor(+v.dataset.video); }
  if (e.target.closest("[data-close]")) closeDrawer();
});

// ---------------------------------------------------------------- Customer form
const dlg = $("#customer-dialog");
const cform = $("#customer-form");
let editingId = null;

function openCustomerForm(c = null) {
  editingId = c ? c.id : null;
  $("#customer-form-title").textContent = c ? "Edit Customer" : "New Customer";
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
    toast("Saved");
    openCustomer(editingId);
  } else {
    const { id } = await api("/customers", { method: "POST", body: data });
    dlg.close();
    toast("Customer added — now add the cars they bought");
    openCustomer(id);
  }
  refresh();
});

// ---------------------------------------------------------------- Detail drawer
function closeDrawer(doRefresh = true) {
  $("#drawer").classList.add("hidden");
  if (doRefresh) refresh();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !dlg.open) closeDrawer(); });

async function openCustomer(id) {
  const { customer: c, purchases, contacts, analysis: a } = await api("/customers/" + id);
  const pct = a.days_left != null ? Math.max(3, Math.min(100, 100 - (a.days_left / (a.cycle_years * 365.25)) * 100)) : 0;

  $("#drawer-body").innerHTML = `
    <h2>${esc(c.name)} ${segBadge(a.segment)}</h2>
    <div class="muted">📞 ${esc(c.phone || "-")} · ✉️ ${esc(c.email || "-")} · 📍 ${esc([c.address, c.city].filter(Boolean).join(", ") || "-")}
      ${c.birth_date ? " · 🎂 " + dt(c.birth_date) : ""}
      ${c.preferred_channel ? " · Prefers: " + esc(META.channels[c.preferred_channel] || c.preferred_channel) : ""}</div>
    ${c.notes ? `<p>${esc(c.notes)}</p>` : ""}
    <p><button class="small" id="btn-edit">Edit</button> <button class="small danger" id="btn-del">Delete customer</button>
      ${a.purchase_count ? `<button class="small" data-video="${c.id}">🎬 Personalised ad video</button>` : ""}</p>

    <div class="section">
      <h4 style="margin-top:0">📊 Analysis <span class="score" style="float:right">Priority ${a.score}/100</span></h4>
      ${a.purchase_count ? `
        <div class="st ${a.status}">${esc(a.status_label)}</div>
        <div class="timeline-bar"><div class="${a.status}" style="width:${pct}%"></div></div>
        <div class="muted" style="font-size:12px">Last purchase ${dt(a.last_purchase.date)} → expected upgrade ${dt(a.expected_date)}</div>
        <ul>${a.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
        : `<p class="muted">Add the car they bought below to see the analysis.</p>`}
    </div>

    ${a.actions.length ? `
    <div class="section">
      <h4 style="margin-top:0">🤝 Recommended contact</h4>
      ${a.actions.map((x) => `<div class="rec"><b>${esc(x.label)}</b><span>${esc(x.why)}</span></div>`).join("")}
    </div>` : ""}

    ${a.script ? `
    <div class="section">
      <h4 style="margin-top:0">🗣️ What to say <button class="small" id="btn-copy" style="float:right">Copy</button></h4>
      <div class="script">${esc(a.script)}</div>
    </div>` : ""}

    <div class="section">
      <h4 style="margin-top:0">🚗 Cars purchased</h4>
      <table class="mini">
        <tr><th>Date</th><th>Car</th><th>Model year</th><th>Price</th><th></th></tr>
        ${purchases.map((p) => `<tr><td>${dt(p.date)}</td><td>${esc(carName(p))}</td><td>${esc(p.model_year || "-")}</td>
          <td>${money(p.price)}</td><td><button class="small danger" data-del-p="${p.id}">Delete</button></td></tr>`).join("") ||
          `<tr><td colspan="5" class="muted">No purchases yet</td></tr>`}
      </table>
      <form class="inline" id="purchase-form">
        <label>Purchase date<input name="date" type="date" required></label>
        <label>Brand<input name="brand" required></label>
        <label>Model<input name="model"></label>
        <label>Model year<input name="model_year" type="number" min="1950" max="2100"></label>
        <label>Price (TL)<input name="price" type="number" min="0" step="1000"></label>
        <button class="primary">+ Add car</button>
      </form>
    </div>

    <div class="section">
      <h4 style="margin-top:0">📝 Contact history</h4>
      <table class="mini">
        <tr><th>Date</th><th>Channel</th><th>Outcome</th><th>Note</th><th>Follow up</th><th></th></tr>
        ${contacts.slice().reverse().map((x) => `<tr><td>${dt(x.date)}</td><td>${esc(META.channels[x.channel] || x.channel)}</td>
          <td>${esc(META.outcomes[x.outcome] || x.outcome || "-")}</td><td>${esc(x.notes || "")}</td>
          <td>${x.next_contact_date ? dt(x.next_contact_date) : "-"}</td>
          <td><button class="small danger" data-del-c="${x.id}">Delete</button></td></tr>`).join("") ||
          `<tr><td colspan="6" class="muted">No contact yet</td></tr>`}
      </table>
      <form class="inline" id="contact-form">
        <label>Date<input name="date" type="date" value="${today()}"></label>
        <label>Channel<select name="channel">${channelOptions(false)}</select></label>
        <label>Outcome<select name="outcome">${outcomeOptions()}</select></label>
        <label>Follow up on (opt.)<input name="next_contact_date" type="date"></label>
        <label style="grid-column:1/-1">Note<input name="notes" placeholder="What was discussed, which gift was sent…"></label>
        <button class="primary">+ Log contact</button>
      </form>
    </div>`;

  if (a.actions[0]) $("#contact-form").elements.channel.value = a.actions[0].channel;
  $("#drawer").classList.remove("hidden");

  $("#btn-edit").onclick = () => openCustomerForm(c);
  $("#btn-del").onclick = async () => {
    if (!confirm(`Delete ${c.name} and their whole history?`)) return;
    await api("/customers/" + id, { method: "DELETE" });
    toast("Deleted");
    closeDrawer();
  };
  const copy = $("#btn-copy");
  if (copy) copy.onclick = () => navigator.clipboard.writeText(a.script).then(() => toast("Copied"));

  const submitter = (url, msg) => async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    for (const k in d) if (d[k] === "") d[k] = null;
    await api(url, { method: "POST", body: d });
    toast(msg);
    openCustomer(id);
  };
  $("#purchase-form").onsubmit = submitter(`/customers/${id}/purchases`, "Car added");
  $("#contact-form").onsubmit = submitter(`/customers/${id}/contacts`, "Contact logged");
  $$("[data-del-p]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this purchase?")) return;
    await api("/purchases/" + b.dataset.delP, { method: "DELETE" });
    openCustomer(id);
  }));
  $$("[data-del-c]").forEach((b) => (b.onclick = async () => {
    if (!confirm("Delete this contact entry?")) return;
    await api("/contacts/" + b.dataset.delC, { method: "DELETE" });
    openCustomer(id);
  }));
}

// ---------------------------------------------------------------- Media: 30-second ad video
const Ad = (() => {
  const canvas = $("#ad-canvas");
  const ctx = canvas.getContext("2d");
  let opts = {};
  let t = 0, playing = false, startedAt = 0, raf = 0;
  let ac = null, musicNode = null;

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function draw() {
    // when stopped at the very start or end (fully faded), show the call-to-action scene as a poster
    const poster = !playing && (t <= 0.4 || t >= AdVideo.DURATION - 0.8);
    AdVideo.render(ctx, poster ? 27.5 : t, opts);
    $("#ad-seek").value = t;
    $("#ad-time").textContent = `${fmt(t)} / ${fmt(AdVideo.DURATION)}`;
  }
  function audio() {
    ac = ac || new AudioContext();
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function stopMusic() {
    if (musicNode) { try { musicNode.disconnect(); } catch {} musicNode = null; }
  }
  function startMusic(dest) {
    stopMusic();
    if (!$("#ad-music").checked) return;
    const a = audio();
    // the music timeline is anchored to the video's start, so resuming mid-way picks up in sync
    musicNode = AdVideo.music(a, dest || a.destination, a.currentTime - t);
  }
  function loop() {
    t = Math.min(AdVideo.DURATION, (performance.now() - startedAt) / 1000);
    draw();
    if (t >= AdVideo.DURATION) { pause(); draw(); onEnd && onEnd(); return; }
    raf = requestAnimationFrame(loop);
  }
  let onEnd = null;
  function play(dest) {
    if (t >= AdVideo.DURATION) t = 0;
    playing = true;
    startedAt = performance.now() - t * 1000;
    startMusic(dest);
    $("#ad-play").classList.add("hidden");
    $("#ad-toggle").textContent = "⏸ Pause";
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }
  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    stopMusic();
    $("#ad-play").classList.remove("hidden");
    $("#ad-toggle").textContent = "▶ Play";
  }
  function seek(v) { t = +v; if (playing) play(); else draw(); }
  function setOpts(o) { opts = o; draw(); }

  // Records one real-time play-through of the canvas + music.
  async function record(filename, onProgress) {
    const a = audio();
    const dest = a.createMediaStreamDestination();
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    // H.264 MP4 plays everywhere (WhatsApp, iPhone); WebM is the fallback for browsers that can't record MP4.
    const types = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1.4D401F,mp4a.40.2", "video/mp4;codecs=avc1",
      "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = types.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    if (!mimeType) throw new Error("This browser cannot record video. Use Chrome or Edge.");
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 3_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => (rec.onstop = res));
    pause(); t = 0; draw();
    rec.start(500);
    const tick = setInterval(() => onProgress(t / AdVideo.DURATION), 200);
    await new Promise((res) => { onEnd = res; play(dest); });
    onEnd = null;
    clearInterval(tick);
    await new Promise((r) => setTimeout(r, 300));
    rec.stop();
    await done;
    const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(new Blob(chunks, { type: mimeType.split(";")[0] }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `${filename}.${ext}` });
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return ext;
  }

  $("#ad-play").onclick = () => play();
  $("#ad-toggle").onclick = () => (playing ? pause() : play());
  canvas.onclick = () => (playing ? pause() : play());
  $("#ad-seek").oninput = (e) => seek(e.target.value);
  $("#ad-music").onchange = () => { if (playing) startMusic(); };

  return { play, pause, setOpts, record, isPlaying: () => playing };
})();

let mediaCustomers = [];
async function loadMedia(selectId) {
  const [settings, customers] = await Promise.all([api("/settings"), api("/customers")]);
  SETTINGS = settings;
  mediaCustomers = customers.filter((x) => x.analysis.purchase_count);
  const sel = $("#ad-customer");
  const keep = selectId ?? sel.value;
  sel.innerHTML = `<option value="">— General version (everyone) —</option>` +
    mediaCustomers.map(({ customer: c, analysis: a }) =>
      `<option value="${c.id}">${esc(c.name)} — ${esc(carName(a.last_purchase))}${a.status === "overdue" || a.status === "due_soon" ? " ★" : ""}</option>`).join("");
  sel.value = mediaCustomers.some((x) => String(x.customer.id) === String(keep)) ? String(keep) : "";
  applyAdOptions();
}

function applyAdOptions() {
  const id = $("#ad-customer").value;
  const item = mediaCustomers.find((x) => String(x.customer.id) === id);
  const s = SETTINGS;
  const base = { dealer: s.dealer_name, phone: s.dealer_phone, address: s.dealer_address };
  let caption;
  if (item) {
    const { customer: c, analysis: a } = item;
    const first = c.name.split(" ")[0];
    const car = carName(a.last_purchase);
    const yrs = Math.max(1, Math.round(a.owned_years));
    Ad.setOpts({ ...base, firstName: first, car, years: yrs });
    caption = `Hi ${first}! Your ${car} has been with you for ${plural(yrs, "year")} — it might be worth more than you think. ` +
      `We made this short video just for you 🎬 Drop by ${s.dealer_name} this week for a free valuation and a test drive. ` +
      `Call us on ${s.dealer_phone}.`;
    $("#ad-hint").textContent = `Personalised for ${c.name}: their name and ${car} appear in the video.`;
  } else {
    Ad.setOpts(base);
    caption = `Time for your next car? 🚗 Bring your current car to ${s.dealer_name} for a free valuation in 15 minutes, ` +
      `flexible financing and a test drive of any new model. ${s.dealer_address} · ${s.dealer_phone}`;
    $("#ad-hint").textContent = "The general version works for any audience. Pick a customer to show their name and current car in the video.";
  }
  $("#ad-caption").textContent = caption;
}

function openMediaFor(id) {
  showTab("media");
  loadMedia(id);
}

$("#ad-customer").onchange = applyAdOptions;
$("#ad-copy").onclick = () => navigator.clipboard.writeText($("#ad-caption").textContent).then(() => toast("Copied"));
$("#ad-download").onclick = async () => {
  const btn = $("#ad-download");
  const box = $("#ad-progress");
  const id = $("#ad-customer").value;
  const item = mediaCustomers.find((x) => String(x.customer.id) === id);
  const slug = (s) => s.toLocaleLowerCase("tr").replace(/[çğıöşü]/g, (c) => "cgiosu"["çğıöşü".indexOf(c)])
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const name = item ? `ad-${slug(item.customer.name)}` : "ad-30s";
  btn.disabled = true;
  box.classList.remove("hidden");
  try {
    const ext = await Ad.record(name, (p) => ($("#ad-progress .bar div").style.width = `${Math.round(p * 100)}%`));
    toast(ext === "mp4" ? "Video saved (MP4)" : "Video saved as WebM — for an MP4 that plays on every phone, use Chrome or Edge");
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    box.classList.add("hidden");
  }
};

// ---------------------------------------------------------------- Settings
async function loadSettings() {
  const s = await api("/settings");
  for (const f of [$("#settings-form"), $("#dealer-form")])
    for (const [k, v] of Object.entries(s)) if (f.elements[k]) f.elements[k].value = v;
}
$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const d = Object.fromEntries([...new FormData(e.target)].map(([k, v]) => [k, Number(v)]));
  await api("/settings", { method: "PUT", body: d });
  toast("Settings saved");
});
$("#dealer-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await api("/settings", { method: "PUT", body: Object.fromEntries(new FormData(e.target)) });
  toast("Dealership details saved");
});
$("#btn-demo").addEventListener("click", async () => {
  await api("/demo", { method: "POST" });
  toast("Sample customers added");
  showTab("leads");
});
$("#btn-import").addEventListener("click", async () => {
  const file = $("#csv").files[0];
  if (!file) return toast("Choose a CSV file first");
  const fd = new FormData();
  fd.append("file", file);
  const r = await api("/import", { method: "POST", body: fd });
  toast(`${r.customers} new customers, ${r.purchases} purchases added` + (r.skipped ? ` (${r.skipped} rows skipped)` : ""));
  $("#csv").value = "";
});
$("#btn-sample").addEventListener("click", async () => {
  const r = await api("/import-sample", { method: "POST" });
  toast(`${r.customers} customers, ${r.purchases} purchases loaded` + (r.skipped ? ` (${r.skipped} already there)` : ""));
  showTab("leads");
});

// ---------------------------------------------------------------- Start
(async () => {
  META = await api("/meta");
  $$("select[data-channels]").forEach((s) => (s.innerHTML = channelOptions(s.dataset.channels === "optional")));
  refresh();
})();
