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

  const api = { normalizeDate, parseTrailList, sheetFromLink, csvUrl, parseCSV, rowsToTrails, areaFromRows, areasFromRows };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else (root.TN = root.TN || {}).parse = api;
})(typeof self !== "undefined" ? self : this);
