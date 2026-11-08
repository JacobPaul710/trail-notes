"use strict";
// Turning recordings into text, on the phone. Talks to stt-worker.js.
//   TN.stt.isReady()                      model downloaded on this phone?
//   TN.stt.download(onProgress)           get the model (needs signal, once)
//   TN.stt.transcribe(buffer, mime, onProgress) -> text
//   TN.stt.cancel()                       stop whatever is running
// onProgress gets { phase: "download", loaded, total } or { phase: "decode" } or { phase: "listen" }.
(function (root) {
  const READY_KEY = "tn-stt-ready";
  let worker = null;
  let job = null; // { id, resolve, reject, onProgress }
  let seq = 0;

  const isReady = () => {
    try { return localStorage.getItem(READY_KEY) === "1"; } catch (e) { return false; }
  };
  const markReady = () => {
    try { localStorage.setItem(READY_KEY, "1"); } catch (e) { /* ignore */ }
  };

  function getWorker() {
    if (worker) return worker;
    worker = new Worker("js/stt-worker.js", { type: "module" });
    worker.onmessage = (e) => {
      const m = e.data || {};
      if (!job || m.id !== job.id) return;
      if (m.type === "download") job.onProgress && job.onProgress({ phase: "download", loaded: m.loaded, total: m.total });
      else if (m.type === "working") job.onProgress && job.onProgress({ phase: "listen" });
      else if (m.type === "ready") { markReady(); finish(null, true); }
      else if (m.type === "done") { markReady(); finish(null, m.text); }
      else if (m.type === "error") finish(friendly(m.message));
    };
    worker.onerror = (e) => {
      e.preventDefault && e.preventDefault();
      finish(friendly((e && e.message) || "the speech engine's file wouldn't open. Reload the page (Cmd+Shift+R) and try again"));
      reset();
    };
    return worker;
  }

  function friendly(message) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    const err = new Error(
      !isReady() && offline
        ? "The speech model needs downloading once, with signal. Your recording is saved."
        : /fetch|network|load/i.test(message) && !/speech library/.test(message)
          ? "Couldn't download the speech model. Check your signal and try again. Your recording is saved."
          : `Couldn't turn this into text (${message}). Your recording is saved.`
    );
    err.code = !isReady() && offline ? "NEEDS_MODEL" : "FAILED";
    return err;
  }

  function finish(err, value) {
    const j = job;
    job = null;
    if (!j) return;
    if (err) j.reject(err);
    else j.resolve(value);
  }

  function reset() {
    if (worker) worker.terminate();
    worker = null;
  }

  function start(message, onProgress, transfer) {
    if (job) return Promise.reject(new Error("Already working on one. Wait or cancel it first."));
    return new Promise((resolve, reject) => {
      job = { id: ++seq, resolve, reject, onProgress };
      getWorker().postMessage({ ...message, id: job.id }, transfer || []);
    });
  }

  /** Recording bytes -> 16 kHz mono samples, the way Whisper wants them. */
  async function toSamples(buffer) {
    const AC = root.AudioContext || root.webkitAudioContext;
    const ctx = new AC();
    let decoded;
    try {
      decoded = await new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(buffer.slice(0), resolve, reject);
        if (p && p.then) p.then(resolve, reject);
      });
    } finally {
      if (ctx.close) ctx.close();
    }
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return rendered.getChannelData(0);
  }

  const real = {
    isReady,
    download(onProgress) {
      if (!navigator.onLine) return Promise.reject(Object.assign(new Error("Downloading the speech model needs signal."), { code: "NEEDS_MODEL" }));
      return start({ type: "load" }, onProgress);
    },
    async transcribe(buffer, mime, onProgress) {
      if (!isReady() && !navigator.onLine) {
        throw Object.assign(new Error("The speech model needs downloading once, with signal. Your recording is saved."), { code: "NEEDS_MODEL" });
      }
      onProgress && onProgress({ phase: "decode" });
      let samples;
      try {
        samples = await toSamples(buffer);
      } catch (e) {
        throw Object.assign(new Error("Couldn't read that recording. Try recording again."), { code: "FAILED" });
      }
      return start({ type: "transcribe", audio: samples }, onProgress, [samples.buffer]);
    },
    cancel() {
      if (job) {
        const j = job;
        job = null;
        j.reject(Object.assign(new Error("Stopped."), { code: "CANCELLED" }));
      }
      reset(); // the only way to stop it mid-sentence; the model reloads from the phone next time
    },
  };

  // Tests can swap in a stand-in engine before the app starts.
  (root.TN = root.TN || {}).stt = root.TN_TEST_STT || real;
})(self);
