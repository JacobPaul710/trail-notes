"use strict";
// Reading a pasted trail list. Works in the browser (window.TN.parse) and in Node (tests).
(function (root) {
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const pad = (n) => String(n).padStart(2, "0");

  /** "10/8/2026", "10-08-26", "2026-10-08", "Oct 8, 2026" -> "10-08-26". "" if it isn't a date. */
  function normalizeDate(text) {
    const s = String(text || "").trim();
    let m, mo, d, y;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, mo, d] = [+m[1], +m[2], +m[3]];
    else if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/))) [mo, d, y] = [+m[1], +m[2], +m[3]];
    else if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2}|\d{4})$/))) {
      const key = m[1].toLowerCase();
      mo = MONTHS[key.slice(0, 4)] || MONTHS[key.slice(0, 3)];
      if (!mo) return "";
      d = +m[2];
      y = +m[3];
    } else return "";
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
    return `${pad(mo)}-${pad(d)}-${pad(y % 100)}`;
  }

  const looksLikeNumber = (s) => /^#?\d{1,4}\.?$/.test(String(s).trim());

  /**
   * Pasted rows -> { trails: [{ number, name, date }], skipped: [line text], duplicates: [numbers] }.
   * Accepts rows copied from Google Sheets (tab-separated) or typed lines like
   * "12 Rubicon 10/8/2026" or "#12 - Rubicon". Header and blank lines are skipped.
   */
  function parseTrailList(text) {
    const trails = [];
    const skipped = [];
    const duplicates = [];
    const seen = new Set();
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      let number = null, name = "", date = "";
      if (raw.includes("\t")) {
        const cells = raw.split("\t").map((c) => c.trim()).filter(Boolean);
        const iNum = cells.findIndex(looksLikeNumber);
        if (iNum >= 0) {
          number = parseInt(cells[iNum].replace("#", ""), 10);
          for (let i = 0; i < cells.length; i++) {
            if (i === iNum) continue;
            const asDate = normalizeDate(cells[i]);
            if (asDate && !date) date = asDate;
            else if (!asDate && !name) name = cells[i];
          }
        }
      } else {
        const m = line.match(/^#?(\d{1,4})[\s.,:)\-–]+(.+)$/);
        if (m) {
          number = parseInt(m[1], 10);
          let rest = m[2].trim();
          const dm = rest.match(/[\s,]+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{2,4})$/);
          if (dm && normalizeDate(dm[1])) {
            date = normalizeDate(dm[1]);
            rest = rest.slice(0, dm.index).trim();
          }
          name = rest.replace(/^[\-–:]\s*/, "").trim();
        }
      }
      if (number === null || !name) {
        skipped.push(line);
        continue;
      }
      if (seen.has(number)) {
        duplicates.push(number);
        continue;
      }
      seen.add(number);
      trails.push({ number, name, date });
    }
    return { trails, skipped, duplicates };
  }

  // ---------- importing from a Google Sheet link ----------

  /** The sheet's id (and tab, if the link has #gid=...) from a link or a bare id. */
  function sheetFromLink(link) {
    const s = String(link || "").trim();
    const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/) || s.match(/^([a-zA-Z0-9_-]{30,})$/);
    if (!m) return null;
    const g = s.match(/[#&?]gid=(\d+)/);
    return { id: m[1], gid: g ? g[1] : "" };
  }

  /** Where the app reads the sheet as CSV (needs "Anyone with the link can view"). */
  /** CSV of one tab: by name (one tab per area), else the tab in the link, else the first tab. */
  function csvUrl(sheet, tab) {
    const which = tab ? `&sheet=${encodeURIComponent(tab)}` : sheet.gid ? `&gid=${sheet.gid}` : "";
    return `https://docs.google.com/spreadsheets/d/${sheet.id}/gviz/tq?tqx=out:csv${which}`;
  }

  /** The Areas tab: "Areas" on top, one area (tab name) per row. Null if these rows aren't that list. */
  function areasFromRows(rows) {
    const clean = rows.map((r) => r.map((c) => String(c || "").trim()));
    if (!clean.length || !/^areas?$/i.test(clean[0][0] || "")) return null;
    const out = [];
    for (const r of clean.slice(1)) if (r[0] && !out.includes(r[0])) out.push(r[0]);
    return out;
  }

  /** CSV text -> rows of cells (handles quotes, commas and line breaks inside quotes). */
  function parseCSV(text) {
    const rows = [];
    let row = [], cell = "", q = false;
    const s = String(text || "");
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') q = false;
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && s[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /**
   * Sheet rows -> trails. Finds the header row (in the first 15) with a number column
   * ("#", "No", "Number") and a name column ("Name", "Trail"); a "Date" column is optional.
   * Without a header, every row is read like a pasted line.
   */
  function rowsToTrails(rows) {
    const clean = rows.map((r) => r.map((c) => String(c || "").trim()));
    const isNum = (h) => /^(#|no\.?|num(ber)?|trail\s*#|trail\s*(no|num(ber)?)\.?)$/i.test(h);
    const isName = (h) => /(name|trail)/i.test(h) && !isNum(h);
    const isDate = (h) => /date/i.test(h);
    for (let r = 0; r < Math.min(15, clean.length); r++) {
      const head = clean[r];
      const iNum = head.findIndex(isNum);
      const iName = head.findIndex((h, i) => i !== iNum && isName(h));
      if (iNum < 0 || iName < 0) continue;
      const iDate = head.findIndex(isDate);
      const lines = clean.slice(r + 1).map((row) => [row[iNum] || "", row[iName] || "", iDate >= 0 ? row[iDate] || "" : ""].join("\t"));
      return parseTrailList(lines.join("\n"));
    }
    return parseTrailList(clean.map((row) => row.filter(Boolean).join("\t")).join("\n"));
  }

  /** The Trail Tracker template has "Area" in a cell near the top and the area's name beside it. */
  function areaFromRows(rows) {
    for (const row of rows.slice(0, 15)) {
      const cells = row.map((c) => String(c || "").trim());
      const i = cells.findIndex((c) => /^area(\s*\/\s*region)?\s*:?$/i.test(c));
      if (i < 0) continue;
      const name = cells.slice(i + 1).find(Boolean);
      if (name) return name;
    }
    return "";
  }

  const WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, a: 1, an: 1 };

  /** "two point four" / "2.4" / "twenty five" -> number, or null. */
  function wordsToNumber(text) {
    const t = String(text || "").toLowerCase().replace(/-/g, " ").trim();
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    const parts = t.split(/\s+/).filter((w) => w !== "and");
    const pointAt = parts.indexOf("point");
    const whole = (ws) => {
      let sum = 0;
      for (const w of ws) {
        if (/^\d+$/.test(w)) sum += Number(w);
        else if (w in WORDS) sum += WORDS[w];
        else return null;
      }
      return ws.length ? sum : null;
    };
    if (pointAt >= 0) {
      const intPart = pointAt === 0 ? 0 : whole(parts.slice(0, pointAt));
      const digits = parts.slice(pointAt + 1).map((w) => (/^\d$/.test(w) ? w : w in WORDS && WORDS[w] < 10 ? String(WORDS[w]) : null));
      if (intPart === null || !digits.length || digits.includes(null)) return null;
      return Number(`${intPart}.${digits.join("")}`);
    }
    return whole(parts);
  }

  /**
   * "2.4 miles, 1 hour 30 minutes" / "two point four miles and an hour and a half" ->
   * { miles, hours } (hours as a decimal). Missing or unclear parts are null.
   */
  function parseLengthTime(text) {
    const s = String(text || "").toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
    const NUM = "((?:\\d+(?:\\.\\d+)?)|(?:[a-z]+(?: (?:and )?[a-z]+){0,4}))";
    let miles = null, hours = null;
    const mi = s.match(new RegExp(NUM + " ?(?:miles?|mi)\\b"));
    if (mi) {
      const ws = mi[1].split(" ");
      const isNum = (w) => /^\d/.test(w) || w in WORDS || w === "point";
      const k = ws.findIndex(isNum);
      miles = k >= 0 ? wordsToNumber(ws.slice(k).join(" ")) : null;
    }
    let h = 0, any = false;
    if (/\bhalf an hour\b|\ba half hour\b/.test(s)) { h += 0.5; any = true; }
    else {
      const hr = s.match(/(\d+(?:\.\d+)?|[a-z]+(?: [a-z]+){0,3}) ?(?:hours?|hrs?|h)\b/);
      if (hr) {
        const n = wordsToNumber(hr[1].split(" ").slice(-3).join(" ")) ?? wordsToNumber(hr[1].split(" ").slice(-2).join(" ")) ?? wordsToNumber(hr[1].split(" ").slice(-1)[0]);
        if (n !== null) { h += n; any = true; }
      } else if (/\ban hour\b/.test(s)) { h += 1; any = true; }
      if (/\band a half\b|\ba half\b/.test(s) && any && !/half an hour/.test(s)) h += 0.5;
    }
    const mn = s.match(/(\d+|[a-z]+(?: [a-z]+){0,2}) ?(?:minutes?|mins?|m)\b/);
    if (mn) {
      const w = mn[1].split(" ");
      let n = null;
      for (let k = Math.min(3, w.length); k >= 1 && n === null; k--) n = wordsToNumber(w.slice(-k).join(" "));
      if (n !== null) { h += n / 60; any = true; }
    }
    if (any) hours = Math.round(h * 100) / 100;
    return { miles: miles !== null && isFinite(miles) ? miles : null, hours };
  }

  /** Just the miles: "2.4", "2.4 miles", "two point four". null if unclear. */
  function parseMiles(text) {
    const t = String(text || "").toLowerCase().replace(/\b(miles?|mi)\b/g, "").trim();
    if (!t) return null;
    const n = wordsToNumber(t);
    return n !== null && isFinite(n) && n > 0 ? n : null;
  }

  /** Just the time, as decimal hours: "1:30", "1 hour 30 minutes", "90 min", "an hour and a half". null if unclear. */
  function parseHours(text) {
    const t = String(text || "").trim();
    let m = t.match(/^(\d+):(\d{2})$/);
    if (m) return Math.round((Number(m[1]) + Number(m[2]) / 60) * 100) / 100;
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t); // a bare number means hours
    const h = parseLengthTime(t).hours;
    return h !== null && h > 0 ? h : null;
  }

  const api = { parseMiles, parseHours, parseLengthTime, wordsToNumber, normalizeDate, parseTrailList, sheetFromLink, csvUrl, parseCSV, rowsToTrails, areaFromRows, areasFromRows };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (root.TN = root.TN || {}).parse = api;
})(typeof self !== "undefined" ? self : this);
