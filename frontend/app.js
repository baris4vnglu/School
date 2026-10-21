const $ = (id) => document.getElementById(id);

const state = {
  imageBase64: null,   // data: öneki olmadan
  imageDataUrl: null,
  messages: [],        // Ollama formatında konuşma geçmişi
  busy: false,
};

// ---------- Bağlantı durumu ----------
async function checkHealth() {
  const el = $("status");
  try {
    const h = await (await fetch("/api/health")).json();
    if (!h.ollama) {
      el.textContent = "Ollama çalışmıyor";
      el.className = "status err";
    } else if (!h.model_available) {
      el.textContent = `Model yok: ollama pull ${h.model}`;
      el.className = "status err";
    } else {
      el.textContent = `Bağlı · ${h.model}`;
      el.className = "status ok";
    }
  } catch {
    el.textContent = "Sunucuya ulaşılamadı";
    el.className = "status err";
  }
}

// ---------- Görüntü yükleme ----------
function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.imageDataUrl = reader.result;
    state.imageBase64 = reader.result.split(",")[1];
    $("preview").src = reader.result;
    $("preview").hidden = false;
    $("dropText").hidden = true;
    $("analyzeBtn").disabled = state.busy;
  };
  reader.readAsDataURL(file);
}

const dz = $("dropzone");
$("fileInput").addEventListener("change", (e) => loadFile(e.target.files[0]));
dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag"); });
dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
dz.addEventListener("drop", (e) => {
  e.preventDefault();
  dz.classList.remove("drag");
  loadFile(e.dataTransfer.files[0]);
});

// ---------- Basit markdown -> HTML ----------
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderMarkdown(text) {
  const lines = escapeHtml(text).split("\n");
  let html = "";
  let inList = false;
  for (const raw of lines) {
    const line = raw
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    const heading = line.match(/^#{1,4}\s+(.*)/);
    const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/);
    if (item) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${item[1]}</li>`;
      continue;
    }
    if (inList) { html += "</ul>"; inList = false; }
    if (heading) html += `<h3>${heading[1]}</h3>`;
    else if (line.trim()) html += `<p>${line}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

// ---------- Sohbet ----------
function addBubble(role, text, imageUrl) {
  const chat = $("chat");
  chat.querySelector(".placeholder")?.remove();
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    div.appendChild(img);
  }
  const body = document.createElement("div");
  if (role === "user") body.textContent = text;
  div.appendChild(body);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return body;
}

function setBusy(busy) {
  state.busy = busy;
  $("analyzeBtn").disabled = busy || !state.imageBase64;
  $("sendBtn").disabled = busy || state.messages.length === 0;
  $("chatInput").disabled = busy || state.messages.length === 0;
}

async function send(userMessage, imageUrl) {
  state.messages.push(userMessage);
  addBubble("user", userMessage.content, imageUrl);
  const out = addBubble("assistant", "");
  out.classList.add("typing");
  setBusy(true);

  let answer = "";
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: state.messages }),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      answer += decoder.decode(value, { stream: true });
      out.innerHTML = renderMarkdown(answer);
      $("chat").scrollTop = $("chat").scrollHeight;
    }
  } catch (e) {
    answer += `\n\n**Hata:** ${e.message}`;
    out.innerHTML = renderMarkdown(answer);
  }
  out.classList.remove("typing");
  state.messages.push({ role: "assistant", content: answer });
  setBusy(false);
  $("chatInput").focus();
}

$("analyzeBtn").addEventListener("click", () => {
  const info = [
    $("age").value && `Yaş: ${$("age").value}`,
    $("sex").value && `Cinsiyet: ${$("sex").value}`,
    $("imageType").value && `Görüntü tipi: ${$("imageType").value}`,
    $("history").value.trim() && `Şikayet / Anamnez: ${$("history").value.trim()}`,
  ].filter(Boolean);

  const content =
    "Bu hastanın görüntüsünü analiz et ve bana bulguları, olası tanıları, ek tetkikleri ve tedavi önerilerini ver." +
    (info.length ? "\n\nHasta bilgileri:\n" + info.join("\n") : "");

  // Yeni analiz = yeni konuşma
  state.messages = [];
  $("chat").innerHTML = "";
  send({ role: "user", content, images: [state.imageBase64] }, state.imageDataUrl);
});

$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text || state.busy) return;
  $("chatInput").value = "";
  send({ role: "user", content: text });
});

$("resetBtn").addEventListener("click", () => {
  if (state.busy) return;
  state.imageBase64 = state.imageDataUrl = null;
  state.messages = [];
  $("fileInput").value = "";
  $("preview").hidden = true;
  $("dropText").hidden = false;
  ["age", "sex", "imageType", "history"].forEach((id) => ($(id).value = ""));
  $("chat").innerHTML = '<div class="placeholder">Görüntü yükleyip <b>Analiz Et</b>\'e basın. Ardından takip soruları sorabilirsiniz.</div>';
  setBusy(false);
});

checkHealth();
setInterval(checkHealth, 15000);
