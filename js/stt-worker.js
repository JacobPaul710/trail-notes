// Speech-to-text on the phone (Whisper). Runs in the background so the screen stays smooth.
// The model downloads once (about 80 MB) and is kept on the phone, so it works offline after that.
// The library is loaded with import() inside a try, so if it can't load we can say exactly why
// (a static import that fails gives the page no message at all).
const LIB_URLS = [
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js",
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm",
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1",
];

const MODEL = "Xenova/whisper-base.en";
let lib = null;
let asr = null;

async function loadLib() {
  if (lib) return lib;
  const problems = [];
  for (const url of LIB_URLS) {
    try {
      const m = await import(url);
      if (m && m.pipeline) { lib = m; break; }
      problems.push(`${url.split("/").slice(-1)[0] || "package"}: no pipeline in it`);
    } catch (err) {
      problems.push(`${url.split("/").slice(-1)[0] || "package"}: ${(err && err.message) || err}`);
    }
  }
  if (!lib) throw new Error(`couldn't load the speech library from the internet (${problems.join("; ")})`);
  lib.env.allowLocalModels = false;
  lib.env.useBrowserCache = true;
  return lib;
}

async function load(id) {
  if (asr) return asr;
  const files = {};
  const { pipeline } = await loadLib();
  asr = await pipeline("automatic-speech-recognition", MODEL, {
    progress_callback: (p) => {
      if (p.status === "progress" && p.file) {
        files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
        let loaded = 0, total = 0;
        for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
        self.postMessage({ type: "download", id, loaded, total });
      }
    },
  });
  return asr;
}

self.onmessage = async (e) => {
  const { type, id, audio } = e.data || {};
  try {
    if (type === "load") {
      await load(id);
      self.postMessage({ type: "ready", id });
    } else if (type === "transcribe") {
      const t = await load(id);
      self.postMessage({ type: "working", id });
      const out = await t(audio, { chunk_length_s: 30, stride_length_s: 5 });
      const text = Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text;
      self.postMessage({ type: "done", id, text: String(text || "").trim() });
    }
  } catch (err) {
    self.postMessage({ type: "error", id, message: String((err && err.message) || err) });
  }
};
