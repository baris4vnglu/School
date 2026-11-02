// Renders the 30-second ad (frontend/ad.js) to an MP4 file, frame by frame, with its music.
// Needs Node.js, Playwright (npm i playwright && npx playwright install chromium) and ffmpeg.
//
//   node tools/render-ad.js [--dealer "Kaya Motors"] [--phone "+90 392 444 12 34"] [--address "Main St 1, Nicosia"]
//                           [--name Ahmet --car "Toyota RAV4" --years 3] [--out frontend/media/ad-30s.mp4]
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FPS = 30;

function args() {
  const a = process.argv.slice(2);
  const get = (k, d) => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] : d; };
  return {
    dealer: get("dealer", "Your Dealership"),
    phone: get("phone", "+90 392 000 00 00"),
    address: get("address", "Main Street 1, Nicosia"),
    firstName: get("name", ""),
    car: get("car", ""),
    years: get("years", ""),
    out: path.resolve(get("out", path.join(ROOT, "frontend", "media", "ad-30s.mp4"))),
  };
}

(async () => {
  const o = args();
  fs.mkdirSync(path.dirname(o.out), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent('<body style="margin:0"><canvas id="c" width="1280" height="720"></canvas></body>');
  await page.addScriptTag({ path: path.join(ROOT, "frontend", "ad.js") });
  await page.evaluate(() => document.fonts.ready);

  // 1) music, rendered offline to a WAV file
  const wavB64 = await page.evaluate(async () => {
    const sr = 44100;
    const oac = new OfflineAudioContext(2, sr * AdVideo.DURATION, sr);
    AdVideo.music(oac, oac.destination, 0);
    const buf = await oac.startRendering();
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    const view = new DataView(new ArrayBuffer(44 + n * 4));
    const w = (off, s) => [...s].forEach((c, i) => view.setUint8(off + i, c.charCodeAt(0)));
    w(0, "RIFF"); view.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
    view.setUint32(24, sr, true); view.setUint32(28, sr * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
    w(36, "data"); view.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) {
      view.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 0x7fff, true);
      view.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 0x7fff, true);
    }
    let bin = ""; const bytes = new Uint8Array(view.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  });
  const wav = path.join(os.tmpdir(), `ad-music-${process.pid}.wav`);
  fs.writeFileSync(wav, Buffer.from(wavB64, "base64"));

  // 2) frames piped into ffmpeg
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-i", wav,
    "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", o.out,
  ], { stdio: ["pipe", "inherit", "inherit"] });

  const total = 30 * FPS;
  for (let i = 0; i < total; i++) {
    const b64 = await page.evaluate(([t, opts]) => {
      const c = document.getElementById("c");
      AdVideo.render(c.getContext("2d"), t, opts);
      return c.toDataURL("image/jpeg", 0.95).split(",")[1];
    }, [i / FPS, o]);
    if (!ff.stdin.write(Buffer.from(b64, "base64"))) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % FPS === 0) process.stdout.write(`\rRendering ${Math.round((i / total) * 100)}%`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on("close", (code) => (code === 0 ? res() : rej(new Error("ffmpeg exited " + code)))));
  await browser.close();
  fs.unlinkSync(wav);
  console.log(`\rSaved ${o.out}`);
})().catch((e) => { console.error(e); process.exit(1); });
