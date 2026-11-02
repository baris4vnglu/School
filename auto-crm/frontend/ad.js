// Auto CRM - 30-second ad video (Media).
// Everything is drawn on a <canvas> from a pure function of time, so the same code is used for
// the in-browser player, the "Download video" recording and tools/render-ad.mjs (pre-rendered MP4).
(function (global) {
  "use strict";

  const W = 1280, H = 720, DURATION = 30;
  const FONT = "Inter, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const C = { navy: "#0b1226", navy2: "#16224a", blue: "#2f6bff", sky: "#7fb2ff", gold: "#ffc94a", white: "#ffffff", grey: "#aab4cc" };

  // ------------------------------------------------------------------ helpers
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const back = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  function text(ctx, s, x, y, size, opts = {}) {
    ctx.save();
    ctx.font = `${opts.weight || 700} ${size}px ${FONT}`;
    ctx.textAlign = opts.align || "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha *= opts.alpha ?? 1;
    ctx.fillStyle = opts.color || C.white;
    let fs = size;
    if (opts.maxWidth) { // shrink long (personalised) lines to fit
      while (ctx.measureText(s).width > opts.maxWidth && fs > 12) { fs -= 2; ctx.font = `${opts.weight || 700} ${fs}px ${FONT}`; }
    }
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Text that slides up and fades in at `start`, fades out at `end`.
  function lineIn(ctx, t, start, end, s, x, y, size, opts = {}) {
    const a = easeOut(prog(t, start, start + 0.6)) * (1 - prog(t, end - 0.4, end));
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    text(ctx, s, x, y + (1 - a) * 30, size, opts);
    ctx.restore();
  }

  function background(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, C.navy);
    g.addColorStop(1, C.navy2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // moving diagonal light streaks
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const x = ((i * 260 + t * (60 + i * 14)) % (W + 600)) - 300;
      ctx.globalAlpha = 0.05 + (i % 3) * 0.02;
      ctx.fillStyle = i % 2 ? C.sky : C.blue;
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 70, 0); ctx.lineTo(x - 230, H); ctx.lineTo(x - 300, H);
      ctx.fill();
    }
    ctx.restore();
  }

  function car(ctx, x, y, s, t, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath(); ctx.ellipse(0, 62, 190, 14, 0, 0, Math.PI * 2); ctx.fill();
    // body
    const g = ctx.createLinearGradient(0, -60, 0, 50);
    g.addColorStop(0, color); g.addColorStop(1, "#173a99");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-200, 30);
    ctx.quadraticCurveTo(-205, -5, -170, -12);
    ctx.lineTo(-95, -20);
    ctx.quadraticCurveTo(-55, -72, 10, -74);
    ctx.lineTo(70, -72);
    ctx.quadraticCurveTo(115, -66, 140, -22);
    ctx.lineTo(185, -12);
    ctx.quadraticCurveTo(208, -5, 205, 30);
    ctx.quadraticCurveTo(205, 44, 190, 44);
    ctx.lineTo(-188, 44);
    ctx.quadraticCurveTo(-202, 44, -200, 30);
    ctx.fill();
    // windows
    ctx.fillStyle = "rgba(200,225,255,.85)";
    ctx.beginPath();
    ctx.moveTo(-80, -22); ctx.quadraticCurveTo(-45, -62, 2, -63); ctx.lineTo(2, -22); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -63); ctx.lineTo(66, -62); ctx.quadraticCurveTo(100, -57, 120, -22); ctx.lineTo(14, -22); ctx.closePath(); ctx.fill();
    // lights
    ctx.fillStyle = C.gold; roundRect(ctx, 182, -6, 20, 10, 4); ctx.fill();
    ctx.fillStyle = "#ff5a5a"; roundRect(ctx, -201, -4, 12, 10, 3); ctx.fill();
    // wheels
    for (const wx of [-120, 125]) {
      ctx.save();
      ctx.translate(wx, 42);
      ctx.fillStyle = "#11151f"; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#c9d1e3"; ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(t * 14);
      ctx.strokeStyle = "#6c7891"; ctx.lineWidth = 4;
      for (let k = 0; k < 5; k++) { ctx.rotate((Math.PI * 2) / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
  }

  function road(ctx, t, y) {
    ctx.fillStyle = "#1b2440";
    ctx.fillRect(0, y, W, H - y);
    ctx.fillStyle = "rgba(255,255,255,.55)";
    const off = (t * 900) % 160;
    for (let x = -off; x < W; x += 160) ctx.fillRect(x, y + 60, 80, 8);
  }

  function check(ctx, x, y, r, a) {
    ctx.save();
    ctx.globalAlpha *= a;
    ctx.fillStyle = C.blue;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.white; ctx.lineWidth = r * 0.22; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(x - r * 0.42, y + r * 0.02); ctx.lineTo(x - r * 0.1, y + r * 0.35); ctx.lineTo(x + r * 0.45, y - r * 0.3); ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ scenes
  // opts: { dealer, phone, address, firstName, car, years }
  function scene1(ctx, t, o) { // 0 - 4.5 s: brand intro
    const z = easeOut(prog(t, 0.2, 1.4));
    ctx.save();
    ctx.globalAlpha = z;
    ctx.translate(W / 2, H / 2 - 40);
    ctx.scale(0.7 + 0.3 * z, 0.7 + 0.3 * z);
    text(ctx, o.dealer.toUpperCase(), 0, 0, 84, { weight: 800, maxWidth: 1100 });
    ctx.restore();
    const lw = 420 * easeInOut(prog(t, 1.0, 2.0));
    ctx.fillStyle = C.gold;
    ctx.fillRect(W / 2 - lw / 2, H / 2 + 20, lw, 5);
    lineIn(ctx, t, 1.6, 4.5, "Time for your next car?", W / 2, H / 2 + 80, 40, { weight: 500, color: C.sky });
  }

  function scene2(ctx, t, o) { // 4.5 - 11 s: road + the hook
    const lt = t - 4.5;
    road(ctx, lt, 520);
    const x = -300 + easeOut(prog(lt, 0, 2.2)) * (W / 2 + 300);
    const bob = Math.sin(lt * 18) * 1.5;
    car(ctx, x, 470 + bob, 1, lt, C.blue);
    const l1 = o.firstName ? `${o.firstName}, your ${o.car} is ${o.years} years old.` : "Driving the same car for 3+ years?";
    const l2 = o.firstName ? "Ready for an upgrade?" : "It might be worth more than you think.";
    lineIn(ctx, t, 5.2, 11, l1, W / 2, 150, 54, { weight: 800, maxWidth: 1180 });
    lineIn(ctx, t, 6.4, 11, l2, W / 2, 225, 36, { weight: 500, color: C.sky, maxWidth: 1180 });
  }

  function scene3(ctx, t, o) { // 11 - 17.5 s: trade-in gauge
    lineIn(ctx, t, 11.2, 17.5, "Trade it in at top value", W / 2, 120, 58, { weight: 800 });
    const cx = W / 2, cy = 470, r = 200;
    const a = easeOut(prog(t, 11.4, 12.2)) * (1 - prog(t, 17.1, 17.5));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.lineCap = "round";
    ctx.lineWidth = 26;
    ctx.strokeStyle = "rgba(255,255,255,.12)";
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI); ctx.stroke();
    const v = easeInOut(prog(t, 12.0, 14.8));
    const grad = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
    grad.addColorStop(0, C.blue); grad.addColorStop(1, C.gold);
    ctx.strokeStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, Math.PI + Math.PI * 0.92 * v); ctx.stroke();
    // needle
    const ang = Math.PI + Math.PI * 0.92 * v;
    ctx.strokeStyle = C.white; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * (r - 40), cy + Math.sin(ang) * (r - 40)); ctx.stroke();
    ctx.fillStyle = C.white; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    const pct = Math.round(92 * v);
    if (a > 0) text(ctx, `${pct}%`, cx, cy - 75, 64, { weight: 800, color: C.gold, alpha: a });
    lineIn(ctx, t, 13.0, 17.5, "Free valuation in 15 minutes", W / 2, 560, 38, { weight: 600, color: C.sky });
    lineIn(ctx, t, 13.6, 17.5, "Bring your car, leave with an offer", W / 2, 615, 28, { weight: 400, color: C.grey });
  }

  function scene4(ctx, t, o) { // 17.5 - 24 s: three benefits
    lineIn(ctx, t, 17.7, 24, "Why upgrade with us?", W / 2, 120, 54, { weight: 800 });
    const items = ["Best trade-in price", "Flexible financing", "Test drive any new model"];
    items.forEach((s, i) => {
      const st = 18.4 + i * 0.8;
      const p = back(prog(t, st, st + 0.6));
      const out = 1 - prog(t, 23.6, 24);
      if (p <= 0 || out <= 0) return;
      const y = 250 + i * 130;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p) * out;
      ctx.translate(W / 2, y);
      ctx.scale(0.85 + 0.15 * p, 0.85 + 0.15 * p);
      ctx.fillStyle = "rgba(255,255,255,.08)";
      roundRect(ctx, -380, -48, 760, 96, 22); ctx.fill();
      check(ctx, -310, 0, 28, 1);
      text(ctx, s, -255, 0, 38, { weight: 700, align: "left" });
      ctx.restore();
    });
  }

  function scene5(ctx, t, o) { // 24 - 30 s: call to action
    const lt = t - 24;
    road(ctx, lt, 600);
    car(ctx, 220 + Math.sin(lt * 2) * 6, 560, 0.6, lt, C.blue);
    const line = o.firstName ? `${o.firstName}, visit ${o.dealer} this week` : `Visit ${o.dealer} this week`;
    lineIn(ctx, t, 24.2, 31, line, W / 2, 130, 52, { weight: 800, maxWidth: 1180 });
    const pulse = 1 + Math.sin(lt * 5) * 0.03 * prog(t, 25.5, 26);
    const a = easeOut(prog(t, 24.8, 25.5));
    if (a > 0) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(W / 2, 280);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = C.gold;
      roundRect(ctx, -330, -55, 660, 110, 55); ctx.fill();
      text(ctx, o.phone, 0, 2, 54, { weight: 800, color: C.navy, maxWidth: 600 });
      ctx.restore();
    }
    lineIn(ctx, t, 25.4, 31, o.address, W / 2, 390, 32, { weight: 500, color: C.sky, maxWidth: 1100 });
    lineIn(ctx, t, 26.0, 31, "Show this video at the showroom for a free gift", W / 2, 450, 30, { weight: 600, color: C.white, maxWidth: 1100 });
  }

  const SCENES = [[0, 4.5, scene1], [4.5, 11, scene2], [11, 17.5, scene3], [17.5, 24, scene4], [24, 30, scene5]];

  function render(ctx, t, opts) {
    const o = {
      dealer: opts.dealer || "Your Dealership",
      phone: opts.phone || "",
      address: opts.address || "",
      firstName: opts.firstName || "",
      car: opts.car || "car",
      years: opts.years || "",
    };
    t = clamp(t, 0, DURATION);
    ctx.save();
    ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0);
    background(ctx, t);
    for (const [a, b, fn] of SCENES) {
      if (t < a - 0.01 || t > b + 0.5) continue;
      ctx.save();
      // short crossfade between scenes
      ctx.globalAlpha = clamp((t - a + 0.35) / 0.35) * clamp((b + 0.35 - t) / 0.35);
      fn(ctx, t, o);
      ctx.restore();
    }
    // progress bar + final fade
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(0, H - 6, W, 6);
    ctx.fillStyle = C.gold;
    ctx.fillRect(0, H - 6, (W * t) / DURATION, 6);
    const fade = Math.max(prog(t, 29.2, 30), 1 - prog(t, 0, 0.4));
    if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  // ------------------------------------------------------------------ music
  // Upbeat 30 s loop: pad chords, bass, kick and hi-hat. Works with AudioContext and OfflineAudioContext.
  function music(ac, dest, start = ac.currentTime) {
    const bpm = 112, beat = 60 / bpm;
    const now = ac.currentTime - 0.005; // when resuming mid-way, notes that should already have started are skipped
    const live = (x) => x >= now;
    const master = ac.createGain();
    const g = master.gain, t0 = ac.currentTime, end = start + DURATION;
    if (start >= t0) { g.setValueAtTime(0, start); g.linearRampToValueAtTime(0.55, start + 1.0); }
    else g.setValueAtTime(0.55, t0); // resumed mid-way: no fade-in
    if (end - 1.5 > t0) g.setValueAtTime(0.55, end - 1.5);
    g.linearRampToValueAtTime(0, Math.max(end, t0 + 0.05));
    master.connect(dest);

    const lp = ac.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1800;
    lp.connect(master);

    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // C - G - Am - F, one chord per bar (4 beats)
    const chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
    const bassNotes = [36, 43, 45, 41];
    const bars = Math.ceil(DURATION / (beat * 4));

    const noise = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    for (let bar = 0; bar < bars; bar++) {
      const t0 = start + bar * beat * 4;
      if (t0 >= start + DURATION) break;
      const ch = chords[bar % 4];
      // pad
      if (live(t0)) for (const m of ch) {
        for (const det of [-6, 6]) {
          const o = ac.createOscillator(); o.type = "sawtooth";
          o.frequency.value = hz(m); o.detune.value = det;
          const g = ac.createGain();
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.035, t0 + 0.08);
          g.gain.setValueAtTime(0.035, t0 + beat * 4 - 0.12);
          g.gain.linearRampToValueAtTime(0, t0 + beat * 4);
          o.connect(g); g.connect(lp);
          o.start(t0); o.stop(t0 + beat * 4 + 0.05);
        }
      }
      for (let b = 0; b < 4; b++) {
        const tb = t0 + b * beat;
        if (tb >= start + DURATION) break;
        // bass (eighths)
        for (const half of [0, 0.5]) {
          const o = ac.createOscillator(); o.type = "triangle";
          o.frequency.value = hz(bassNotes[bar % 4] + (half && b % 2 ? 12 : 0));
          const g = ac.createGain();
          const ts = tb + half * beat;
          if (!live(ts)) continue;
          g.gain.setValueAtTime(0.0001, ts);
          g.gain.exponentialRampToValueAtTime(0.32, ts + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, ts + beat * 0.45);
          o.connect(g); g.connect(master);
          o.start(ts); o.stop(ts + beat * 0.5);
        }
        // kick
        if (tb > start + 3.8 && live(tb)) {
          const o = ac.createOscillator(); o.type = "sine";
          o.frequency.setValueAtTime(140, tb);
          o.frequency.exponentialRampToValueAtTime(45, tb + 0.12);
          const g = ac.createGain();
          g.gain.setValueAtTime(0.7, tb);
          g.gain.exponentialRampToValueAtTime(0.0001, tb + 0.25);
          o.connect(g); g.connect(master);
          o.start(tb); o.stop(tb + 0.3);
        }
        // hi-hat on the off-beat
        if (tb > start + 7.5 && live(tb + beat / 2)) {
          const s = ac.createBufferSource(); s.buffer = noise;
          const hp = ac.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 7000;
          const g = ac.createGain();
          const th = tb + beat / 2;
          g.gain.setValueAtTime(0.12, th);
          g.gain.exponentialRampToValueAtTime(0.0001, th + 0.06);
          s.connect(hp); hp.connect(g); g.connect(master);
          s.start(th); s.stop(th + 0.08);
        }
      }
    }
    return master;
  }

  global.AdVideo = { W, H, DURATION, render, music };
})(typeof window !== "undefined" ? window : globalThis);
