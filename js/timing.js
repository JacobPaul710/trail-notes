// © 2026 Jacob Scott. All rights reserved.
// Trail timing: Start / Pause / Resume per trail, kept as time segments.
// A trail can have several segments (it forks, you pause it, drive the other trail, come back and resume).
// Each segment is { start, end } in the phone's clock (ms); end is null while it's running.
// The Trail Engine gives each trail the GoPro photos taken inside its segments.
(function (root) {
  "use strict";

  const segs = (card) => (card && Array.isArray(card.segments) ? card.segments : []);
  const openSeg = (card) => segs(card).find((s) => s.end == null) || null;

  /** "none" (never started) | "running" | "paused" | "stopped" (Stop was tapped: finished timing) */
  function stateOf(card) {
    if (openSeg(card)) return "running";
    if (card && card.timingStoppedAt && segs(card).length) return "stopped";
    return segs(card).length ? "paused" : "none";
  }

  /** Begin (or resume) a trail: opens a new segment. Does nothing if it's already running. `offsetMs` = camera clock minus phone clock, when known. */
  function start(card, now, offsetMs) {
    if (openSeg(card)) return false;
    card.segments = [...segs(card), { start: now, end: null, ...(Number.isFinite(offsetMs) ? { offsetMs } : {}) }];
    return true;
  }

  /** Pause (or finish): closes the running segment. Segments that lasted no time at all are dropped. */
  function pause(card, now) {
    const s = openSeg(card);
    if (!s) return false;
    s.end = Math.max(now, s.start);
    if (s.end === s.start) card.segments = segs(card).filter((x) => x !== s);
    return true;
  }

  /** Stop (like a stopwatch's Stop): ends the timing for good. Closes the running stretch if there is one. */
  function stop(card, now) {
    if (!segs(card).length) return false;
    pause(card, now);
    const list = segs(card);
    card.timingStoppedAt = list.length ? list[list.length - 1].end : now;
    return true;
  }

  /** The timing as a plain log: [{ label, at }] such as "Trail started" at 9:14. The last stretch's end reads "finished" once the trail is stopped or done. */
  function log(card, finished) {
    const out = [];
    const list = segs(card);
    list.forEach((s, i) => {
      out.push({ label: i === 0 ? "Trail started" : "Trail resumed", at: s.start });
      if (s.end != null) out.push({ label: i === list.length - 1 && (finished || card.timingStoppedAt) ? "Trail finished" : "Trail paused", at: s.end });
    });
    return out;
  }

  /** The running trail among cards, or null. */
  const running = (cards) => cards.find((c) => openSeg(c)) || null;
  /** Paused trails (started, not running, not finished): the Resume list. */
  const paused = (cards) => cards.filter((c) => stateOf(c) === "paused" && c.status !== "done" && c.status !== "abandoned");

  /** The segments as the Engine reads them (a running one is closed at `now`). */
  function windows(card, now) {
    return segs(card).map((s) => ({ start: s.start, end: s.end == null ? now : s.end }));
  }

  /** Total time recorded, ms. */
  const totalMs = (card, now) => windows(card, now).reduce((n, w) => n + Math.max(0, w.end - w.start), 0);

  /** 3725000 -> "1:02:05"; 125000 -> "2:05". */
  function clock(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const two = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
  }

  /** What goes into the file Trail Notes sends to Drive. Null when the trail was never timed. */
  function forExport(card, now) {
    const w = windows(card, now);
    if (!w.length) return null;
    const offsets = segs(card).map((s) => s.offsetMs).filter(Number.isFinite);
    return { segments: w, ...(offsets.length ? { cameraClockOffsetMs: offsets[offsets.length - 1] } : {}) };
  }

  /**
   * The GoPro's get_date_time answer -> its wall-clock time as ms (read as this phone's local time), or null.
   * It sends something like { date: "2026_10_08", time: "14_22_05", ... }; any separators work.
   */
  function parseCameraClock(answer) {
    const text = typeof answer === "string" ? answer : JSON.stringify(answer || {});
    const d = text.match(/(\d{4})[_:\-/](\d{2})[_:\-/](\d{2})/);
    const t = text.match(/(?:^|[^\d])(\d{2})[_:\-](\d{2})[_:\-](\d{2})(?!\d)/);
    if (!d || !t) return null;
    const ms = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), Number(t[3])).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  const api = { parseCameraClock, stateOf, start, pause, stop, log, running, paused, windows, totalMs, clock, forExport };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (root.TN = root.TN || {}).timing = api;
})(typeof self !== "undefined" ? self : this);
