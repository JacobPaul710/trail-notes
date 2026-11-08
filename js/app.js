"use strict";
// Trail Notes: screens and behavior. Everything is saved on the device.
(function () {
  const { db, parse, criteria, stt } = window.TN;
  const { CRITERIA, pickAnswers } = criteria;
  const $ = (id) => document.getElementById(id);
  const SVG = "http://www.w3.org/2000/svg";

  // areas: [{ id, name, trails: [{ number, name, date }], sheetLink, at }]
  const state = { areas: [], area: null, cards: new Map(), current: null, view: "areas", startMode: "new", back: "areas", pending: null, sheetCounts: {} };

  // ---------- small helpers ----------

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function icon(path, extra) {
    const s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    for (const d of [].concat(path)) {
      const p = document.createElementNS(SVG, "path");
      p.setAttribute("d", d);
      s.append(p);
    }
    if (extra) extra(s);
    return s;
  }
  const ICON = {
    play: "M8 5v14l11-7z",
    pause: ["M8 5v14", "M16 5v14"],
    trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"],
    pin: ["M12 21s-6-5.6-6-11a6 6 0 0 1 12 0c0 5.4-6 11-6 11z"],
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  let toastTimer = null;
  // The loader (same wheel as Trail Engine): a pin riding a dotted trail around a little topo hill.
  // loader() = big, loader(true) = small.
  function loader(small) {
    const d = el("div", small ? "spinner sm" : "spinner");
    d.setAttribute("role", "img");
    d.setAttribute("aria-label", "Working");
    d.innerHTML = '<svg class="wheel" viewBox="0 0 64 64" aria-hidden="true">' +
      '<g fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"><ellipse cx="32" cy="32" rx="22" ry="16"/><ellipse cx="32" cy="32" rx="14" ry="10"/><ellipse cx="32" cy="32" rx="6" ry="4"/></g>' +
      '<circle class="wheel-ring" cx="32" cy="32" r="27" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 8"/>' +
      '<g class="wheel-orbit"><path d="M32 3.5c-3.3 0-5.5 2.3-5.5 5 0 2.8 2.6 4.4 5.5 8 2.9-3.6 5.5-5.2 5.5-8 0-2.7-2.2-5-5.5-5z" fill="#f4efe0"/><circle cx="32" cy="8.5" r="1.9" fill="#1c3a2a"/></g></svg>';
    return d;
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3200);
  }
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const cardKey = (areaId, number) => `${areaId}:${number}`;
  function blankCard(areaId, t) {
    return { key: cardKey(areaId, t.number), area: areaId, number: t.number, name: t.name, date: t.date, answers: {}, said: [], pois: [], areaDesc: "" };
  }

  // A card's progress: answered / total, plus how many need checking.
  // The area description a trail uses: its own if "Custom area description" is on, else the area's.
  function areaTextFor(card, area) {
    return String(card.customArea ? card.customDesc || "" : (area || state.area || {}).desc || "").trim();
  }

  // A trail's progress. Everything counts: the 12 criteria, where it starts (road + paved/unpaved),
  // the POI step (a POI, or "No POIs") and the area description.
  function progress(card, area) {
    let answered = 0, unclear = 0;
    for (const c of CRITERIA) {
      const a = card.answers[c.id];
      if (a && a.status === "answered") answered++;
      else if (a && a.status === "unclear") unclear++;
    }
    if (card.startFrom && card.startPaved) answered++;
    if ((card.pois && card.pois.length) || card.noPois) answered++;
    if (areaTextFor(card, area)) answered++;
    if (card.miles > 0 && card.hours > 0) answered++;
    if (card.restrictions && card.restrictions.length) answered++;
    let total = CRITERIA.length + 5;
    if (needsEndsPaved(card)) { total++; if (card.endsPaved) answered++; }
    return { answered, unclear, total, waiting: hasWaiting(card) };
  }
  // Trails that still have a recording waiting to be turned into text don't count as complete.
  async function loadWaiting() {
    const recs = await db.all("recordings");
    state.waiting = new Set(recs.filter((r) => r.status !== "processed").map((r) => cardKey(r.area || "", r.card)));
  }
  const hasWaiting = (c) => !!(state.waiting && state.waiting.has(cardKey(c.area || "", c.number)));
  const needsEndsPaved = (card) => {
    const a = card.answers && card.answers.ends;
    return !!(a && a.status === "answered" && (a.values || [a.value]).includes("Connects to another path"));
  };
  const isFinished = (c) => c.status === "done" || c.status === "abandoned";
  const REASONS = ["Fallen tree too early", "Private gate too early", "Overgrown too early"];

  function setBar(id, frac) {
    const bar = $(id);
    if (!bar) return;
    const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
    bar.setAttribute("aria-valuenow", String(pct));
    bar.firstElementChild.style.width = `${pct}%`;
  }

  function ring(p) {
    const wrap = el("div", "ring-wrap");
    const C = 2 * Math.PI * 18;
    const s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 44 44");
    s.setAttribute("role", "img");
    s.setAttribute("aria-label", `${p.answered} of ${p.total} answered${p.unclear ? `, ${p.unclear} to check` : ""}`);
    const circle = (color, len, offset) => {
      const c = document.createElementNS(SVG, "circle");
      c.setAttribute("cx", "22"); c.setAttribute("cy", "22"); c.setAttribute("r", "18");
      c.setAttribute("fill", "none"); c.setAttribute("stroke", color); c.setAttribute("stroke-width", "4");
      if (len !== undefined) {
        c.setAttribute("stroke-dasharray", `${len} ${C}`);
        c.setAttribute("stroke-dashoffset", String(-offset));
        c.setAttribute("transform", "rotate(-90 22 22)");
      }
      return c;
    };
    s.append(circle("rgba(128,128,128,0.25)"));
    const g = (p.answered / p.total) * C, y = (p.unclear / p.total) * C;
    if (g) s.append(circle("var(--green)", g, 0));
    if (y) s.append(circle(p.abandoned ? "var(--red)" : "var(--amber)", y, g));
    wrap.append(s);
    const all = p.answered === p.total && !p.waiting;
    const label = p.abandoned ? "×" : p.unclear ? "!" : all ? "✓" : `${p.answered}/${p.total}`;
    const txt = el("span", "ring-text", label);
    if (p.abandoned) txt.style.color = "var(--red)";
    else if (p.unclear) txt.style.color = "var(--amber)";
    else if (all) txt.style.color = "var(--green)";
    wrap.append(txt);
    return wrap;
  }

  // A little circle with a percentage in it (trails finished in an area).
  function pctRing(frac) {
    const wrap = el("div", "ring-wrap area-ring");
    const C = 2 * Math.PI * 18;
    const s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 44 44");
    s.setAttribute("role", "img");
    const pct = Math.round(frac * 100);
    s.setAttribute("aria-label", `${pct}% of trails finished`);
    const circle = (color, len) => {
      const c = document.createElementNS(SVG, "circle");
      c.setAttribute("cx", "22"); c.setAttribute("cy", "22"); c.setAttribute("r", "18");
      c.setAttribute("fill", "none"); c.setAttribute("stroke", color); c.setAttribute("stroke-width", "4");
      if (len !== undefined) { c.setAttribute("stroke-dasharray", `${len} ${C}`); c.setAttribute("transform", "rotate(-90 22 22)"); }
      return c;
    };
    s.append(circle("rgba(128,128,128,0.25)"));
    if (frac > 0) s.append(circle("var(--green)", frac * C));
    wrap.append(s, el("span", "ring-text", `${pct}%`));
    return wrap;
  }

  // ---------- views ----------

  function show(view) {
    state.view = view;
    for (const v of ["areas", "area", "start", "card"]) $(`view-${v}`).hidden = v !== view;
    window.scrollTo(0, 0);
  }

  const saveAreas = () => db.put("kv", state.areas, "areas");

  function renderNet() {
    const on = navigator.onLine;
    for (const pill of document.querySelectorAll(".net-pill")) {
      pill.textContent = on ? "Online" : "Offline";
      pill.className = `pill net-pill ${on ? "online" : "offline"}`;
    }
    // Reading the sheet needs signal; pasting doesn't.
    const imp = $("import-btn");
    $("import-panel").classList.toggle("no-signal", !on);
    if (imp.textContent !== "Reading…") {
      imp.disabled = !on;
      imp.textContent = on ? importLabel() : "No signal right now";
    }
    const chk = $("check-sheet");
    if (chk.textContent !== "Checking…") {
      chk.disabled = !on;
      chk.textContent = on ? "Check the sheet for new trails" : "Check the sheet (needs signal)";
    }
  }

  // ---------- Home: your areas ----------

  // A message that stays until you tap OK (instead of vanishing on a timer).
  function notice(title, message, extra) {
    const body = el("div");
    body.append(el("p", "confirm-text", message));
    const row = el("div", "confirm-row");
    if (extra) row.append(extra);
    const ok = el("button", "btn-primary slim", "OK");
    ok.type = "button";
    ok.addEventListener("click", closeSheet);
    row.append(ok);
    body.append(row);
    openSheet(title, body);
  }

  function driveLink(label) {
    const url = TN.drive.folderUrl();
    if (!url) return null;
    const a = el("a", "btn-ghost slim-btn", label || "Open in Drive");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    return a;
  }

  // ---------- Google Drive sync ----------

  const drive = TN.drive;

  function syncName(area, card) {
    const clean = String(area.name).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
    return `${clean} - ${String(card.number).padStart(4, "0")}.json`;
  }

  // Everything Trail Engine needs to know about one trail.
  function syncPayload(area, card) {
    const answers = {};
    for (const c of CRITERIA) {
      const a = card.answers[c.id];
      if (a && a.status === "answered") answers[c.id] = { label: c.label, value: a.value, ...(a.values ? { values: a.values } : {}), ...(a.number ? { number: a.number } : {}) };
    }
    const areaText = areaTextFor(card, area);
    return {
      app: "trail-notes", version: 1,
      area: area.name, areaId: area.id, number: card.number, name: card.name, date: card.date || "",
      status: card.status || "in-progress", savedForLater: !!card.savedForLater, abandonReason: card.abandonReason || "", finishedAt: card.finishedAt || null,
      startFrom: card.startFrom || "", startPaved: card.startPaved || "", endsAt: card.endsAt || "", endsPaved: card.endsPaved || "",
      curatorNote: card.curatorOn ? String(card.curatorNote || "").trim() : "",
      miles: card.miles > 0 ? card.miles : "", hours: card.hours > 0 ? card.hours : "", milesText: card.milesText || "", timeText: card.timeText || "",
      areaDescription: areaText, customAreaDescription: !!card.customArea,
      level: card.answers.level && card.answers.level.status === "answered" ? card.answers.level.value : "",
      answers, restrictions: card.restrictions || [], noPois: !!card.noPois, pois: (card.pois || []).map((p) => ({ type: p.type, name: p.note || "" })),
      summary: TN.summary.toText(TN.summary.build({ ...card, areaText })),
      said: (card.said || []).map((x) => x.text),
      updatedAt: card.updatedAt, writtenAt: Date.now(),
    };
  }

  const isWaiting = (c) => !!c.updatedAt && (!c.syncedAt || c.updatedAt > c.syncedAt);

  async function renderSync(all) {
    all = all || (await db.all("areacards"));
    const waiting = all.filter(isWaiting).length;
    const last = (await db.get("kv", "lastSync")) || 0;
    const on = navigator.onLine;
    const btn = $("sync-btn");
    state.syncWaiting = waiting;
    if (state.syncing) return;
    const who = drive.account();
    if (!$("sync-dot").classList.contains("link-dot")) $("sync-dot").replaceWith(Object.assign(el("span", "link-dot"), { id: "sync-dot" }));
    const dot = $("sync-dot");
    if (!drive.linked()) {
      dot.className = "link-dot";
      $("sync-title").textContent = waiting ? `${plural(waiting, "trail", "trails")} not backed up yet` : "Not synced yet";
      $("sync-sub").textContent = "Sign in with Google to back up your trails";
      btn.textContent = "Sign in to sync";
      btn.disabled = !on;
    } else if (state.syncError) {
      dot.className = "link-dot bad";
      $("sync-title").textContent = "Sync problem";
      $("sync-sub").textContent = state.syncError;
      btn.textContent = "Try again";
      btn.disabled = !on;
    } else if (waiting) {
      dot.className = "link-dot idle";
      $("sync-title").textContent = `${plural(waiting, "trail", "trails")} waiting to sync`;
      $("sync-sub").textContent = `${who ? who + " · " : ""}${on ? "Tap Sync to send them to your Drive" : "they'll send when you have signal"}`;
      btn.textContent = "Sync";
      btn.disabled = !on;
    } else {
      dot.className = "link-dot ok";
      $("sync-title").textContent = last ? `All synced · ${dayClock(last)}` : "Signed in · nothing to sync yet";
      $("sync-sub").textContent = who ? `Signed in as ${who}` : "Signed in to Google";
      btn.textContent = "Sync";
      btn.disabled = !on;
    }
    const view = $("sync-view"), vurl = drive.linked() ? drive.folderUrl() : "";
    view.hidden = !vurl;
    if (vurl) view.href = vurl;
    const g = $("drawer-google");
    if (g) {
      g.textContent = drive.linked() ? `Signed in${drive.account() ? ` as ${drive.account()}` : ""}. Trails save to the Trail Notes folder in your Drive.` : "Not signed in.";
      $("drawer-signout").hidden = !drive.linked();
      $("drawer-switch").hidden = !drive.linked();
      $("drawer-redirect").textContent = `Sign-in address: ${drive.redirectUri()}`;
    }
  }

  /**
   * Finished trails that just synced go Planned -> Tracked on their area's Trail List tab.
   * Trails saved for later don't touch the sheet. Never blocks the sync.
   */
  async function markTrackedOnSheets(cards) {
    const groups = new Map();
    for (const c of cards) {
      const status = c.status === "done" ? "Tracked" : "";   // saved-for-later trails leave the sheet alone
      if (!status) continue;
      const a = state.areas.find((x) => x.id === c.area);
      const sheet = a && a.sheetLink && a.sheetTab ? parse.sheetFromLink(a.sheetLink) : null;
      if (!sheet) continue;
      const k = `${sheet.id}|${a.sheetTab}|${status}`;
      if (!groups.has(k)) groups.set(k, { id: sheet.id, tab: a.sheetTab, status, nums: [] });
      groups.get(k).nums.push(c.number);
    }
    if (!groups.size) return "";
    if (!drive.canEditSheets()) { toast("Sign in with Google once more so Trail Notes can update trail statuses on your sheet."); return ""; }
    let tracked = 0;
    for (const g of groups.values()) {
      try {
        const n = await drive.markStatus(g.id, g.tab, g.nums, g.status);
        tracked += n;
      } catch (e) { toast(`Couldn't update the sheet status (${e.message})`); }
    }
    return tracked ? ` ${plural(tracked, "trail", "trails")} marked Tracked on your sheet.` : "";
  }

  async function runSync(quiet) {
    if (state.syncing) return;
    if (!navigator.onLine) { if (!quiet) notice("No signal", "Sync needs signal. Your trails are safe on this phone and will send when you're back online."); return; }
    if (!drive.tokenValid()) {
      if (quiet) return;               // never yank you out of the app on its own
      drive.signIn();                  // Google asks once, then sends you straight back and it syncs
      return;
    }
    const all = await db.all("areacards");
    const todo = all.filter(isWaiting);
    if (!todo.length) {
      await renderSync(all);
      if (!quiet) notice("Nothing to send", all.some((c) => c.syncedAt) ? "Everything is already in your Drive." : "Nothing to send yet. Trails go to Drive once you've started on them.");
      return;
    }
    state.syncing = true;
    state.syncError = "";
    $("sync-btn").disabled = true;
    $("sync-title").textContent = `Syncing ${plural(todo.length, "trail", "trails")}…`;
    $("sync-sub").textContent = "Sending to your Google Drive";
    $("sync-dot").replaceWith(Object.assign(loader(true), { id: "sync-dot" }));
    try {
      const files = todo.map((card) => {
        const area = state.areas.find((a) => a.id === card.area) || { id: card.area, name: card.area || "Trails" };
        return { card, name: syncName(area, card), json: JSON.stringify(syncPayload(area, card), null, 1) };
      });
      await drive.upload(files, async (i) => {
        const c = files[i].card;
        await db.put("areacards", { ...c, syncedAt: Date.now() });   // keeps updatedAt, so it isn't "waiting" any more
      });
      await db.put("kv", Date.now(), "lastSync");
      let sheetNote = "";
      try { sheetNote = await markTrackedOnSheets(files.map((f) => f.card)); } catch (e) { sheetNote = ""; }
      const who = drive.account();
      const msg = `Sent ${plural(todo.length, "trail", "trails")} to the Trail Notes folder in your Google Drive${who ? ` (${who})` : ""}. To check, open Drive and look for that folder.${sheetNote}`;
      if (quiet) toast(`Synced ${plural(todo.length, "trail", "trails")} to Drive`);
      else notice("Synced", msg, driveLink("Open in Drive"));
    } catch (e) {
      state.syncError = e.code === "AUTH" ? "Google sign-in ran out. Tap Try again to sign in." : e.message;
      if (quiet) toast(state.syncError); else notice("Sync problem", state.syncError);
    } finally {
      state.syncing = false;
      state.cards = state.area ? new Map((await db.cardsIn(state.area.id)).map((c) => [c.number, c])) : state.cards;
      await renderSync();
    }
  }

  async function renderAreas() {
    const all = await db.all("areacards");
    const list = $("area-list");
    list.textContent = "";
    $("no-areas").hidden = state.areas.length > 0;
    renderSheetPanel();
    let allDone = 0, allTrails = 0;
    for (const a of state.areas) {
      const cards = all.filter((c) => c.area === a.id);
      let done = 0, check = 0;
      for (const c of cards) {
        if (isFinished(c)) done++;
        else if (progress(c, a).unclear) check++;
      }
      const frac = a.trails.length ? Math.min(1, done / a.trails.length) : 0;
      allDone += done; allTrails += a.trails.length;
      const b = el("button", `trail-card${check ? " check" : ""}`);
      b.type = "button";
      const folder = icon("M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z");
      folder.classList.add("folder-icon");
      const main = el("div", "trail-main");
      main.append(el("strong", "", a.name));
      main.append(el("span", check ? "check" : "", `${plural(a.trails.length, "trail", "trails")} · ${done} done${check ? ` · ${check} to check` : ""}`));
      const chev = icon("M9 5l7 7-7 7");
      chev.classList.add("chev");
      b.append(folder, main, pctRing(frac), chev);
      b.addEventListener("click", () => openArea(a.id));
      list.append(b);
    }
    await loadWaiting();
    await renderSync(all);
  }

  // ---------- one area: its trails ----------

  async function openArea(id) {
    const a = state.areas.find((x) => x.id === id);
    if (!a) return;
    state.area = a;
    state.cards = new Map((await db.cardsIn(a.id)).map((c) => [c.number, c]));
    $("check-status").textContent = "";
    $("area-desc").value = a.desc || "";
    if (state.descButton) state.descButton();
    await loadWaiting();
    renderArea();
    show("area");
  }

  function renderArea() {
    const a = state.area;
    $("area-name").textContent = a.name;
    $("area-sub").textContent = plural(a.trails.length, "trail", "trails");
    const list = $("card-list");
    list.textContent = "";
    let finished = 0;
    for (const t of a.trails) {
      const card = state.cards.get(t.number) || blankCard(a.id, t);
      const p = progress(card, a);
      if (isFinished(card)) finished++;
      const b = el("button", "trail-card");
      b.type = "button";
      if (card.status === "abandoned") b.classList.add("abandoned");
      else if (card.status === "done") b.classList.add("done");
      else if (p.unclear) b.classList.add("check");
      else if (card.savedForLater) b.classList.add("inprogress");
      const main = el("div", "trail-main");
      main.append(el("strong", "", t.name));
      let sub, subClass = "";
      if (card.status === "abandoned") sub = `Abandoned${card.abandonReason ? ` · ${card.abandonReason}` : ""}`;
      else if (card.status === "done") sub = `Completed${p.waiting ? " · a recording still needs turning into text" : ""}`;
      else if (p.unclear) { sub = plural(p.unclear, "answer to check", "answers to check"); subClass = "check"; }
      else if (p.waiting) { sub = "A recording still needs turning into text"; subClass = "check"; }
      else if (card.savedForLater) { sub = `In progress · ${p.answered} of ${p.total} answered`; subClass = "check"; }
      else sub = `${t.date ? t.date + " · " : ""}${p.answered ? `${p.answered} of ${p.total} answered` : "not started"}`;
      main.append(el("span", subClass, sub));
      b.append(el("span", "num-badge", `#${t.number}`), main, card.status === "abandoned" ? ring({ ...p, answered: 0, unclear: 1, total: 1, abandoned: true }) : ring(p));
      b.addEventListener("click", () => openCard(t.number));
      list.append(b);
    }
    setBar("area-progress", a.trails.length ? finished / a.trails.length : 0);
    $("check-sheet").hidden = !a.sheetLink;
  }

  // ---------- New area / Add trails: paste or import ----------
  // Both ways fill a preview first; one Create / Add button at the bottom saves it.

  function openStart(mode) {
    state.startMode = mode;
    state.pending = null;
    const adding = mode === "add";
    $("start-title").textContent = adding ? `Add trails to ${state.area.name}` : "Paste a trail list";
    $("start-lead").textContent = adding
      ? "New trail numbers get added. Trails already on this list keep their notes."
      : "No signal? Name the area and paste its trail list (copied from the sheet earlier). Each trail gets its own numbered card.";
    $("area-name-panel").hidden = adding;
    $("import-panel").hidden = !adding;        // new areas from the sheet are added on Home
    $("area-input").value = "";
    $("paste").value = "";
    $("paste-more").open = false;
    const link = (adding && state.area.sheetLink) || state.sheetLink || "";
    $("sheet-link").value = link;
    $("link-row").hidden = !!link;          // linked once: no need to see the link again
    $("change-link").hidden = !link;
    $("area-choices").hidden = true;
    $("area-choices").textContent = "";
    state.areaList = null;
    $("import-status").textContent = "";
    $("import-status").className = "paste-status";
    state.back = adding ? "area" : "areas";
    renderPreview();
    renderNet();
    show("start");

  }

  function importLabel() {
    if (state.startMode === "add" && state.area && state.area.sheetTab) return `Read ${state.area.sheetTab} from the sheet`;
    return state.areaList ? "Reload the areas" : "Read the sheet";
  }

  async function pasteFromClipboard() {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch (e) {
      text = "";
    }
    if (!text || !text.trim()) {
      // Some phones block reading the clipboard from a button. Long-press Paste always works.
      $("paste-more").open = true;
      $("paste").focus();
      toast("Long-press the box and tap Paste.");
      return;
    }
    $("paste").value = text;
    const r = readPaste();
    if (!r.trails.length) $("paste-more").open = true;
    else $("preview").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function readPaste() {
    const text = $("paste").value;
    const r = parse.parseTrailList(text);
    if (!text.trim()) {
      if (state.pending && state.pending.source === "paste") state.pending = null;
    } else {
      state.pending = { trails: r.trails, duplicates: r.duplicates, source: "paste", link: "" };
    }
    renderPreview();
    return r;
  }

  /** In Add mode: which pasted trails are new to this area. */
  function newOnes(trails) {
    if (state.startMode !== "add" || !state.area) return trails;
    const have = new Set(state.area.trails.map((t) => t.number));
    return trails.filter((t) => !have.has(t.number));
  }

  function renderPreview() {
    const p = state.pending;
    const box = $("preview");
    const btn = $("build-btn");
    const adding = state.startMode === "add";
    const list = $("preview-list");
    list.textContent = "";
    if (!p) {
      box.hidden = true;
      btn.disabled = true;
      btn.textContent = adding ? "Add trails" : "Create area";
      return;
    }
    box.hidden = false;
    box.classList.toggle("warn", !p.trails.length);
    if (!p.trails.length) {
      $("preview-title").textContent = "No trails found yet";
      $("preview-sub").textContent = "Each row needs a number and a name. Tap \"Or type or edit the list\" to check what was pasted.";
      btn.disabled = true;
      btn.textContent = adding ? "Add trails" : "Create area";
      return;
    }
    const first = p.trails[0].number, last = p.trails[p.trails.length - 1].number;
    $("preview-title").textContent = `Ready: ${plural(p.trails.length, "trail", "trails")}, #${first} to #${last}`;
    const bits = [p.source === "sheet" ? "From the sheet" : "From your clipboard"];
    const fresh = newOnes(p.trails);
    if (adding) bits.push(fresh.length === p.trails.length ? "all new" : `${fresh.length} new, ${p.trails.length - fresh.length} already here`);
    if (p.duplicates && p.duplicates.length) bits.push(`repeated numbers skipped: #${p.duplicates.join(", #")}`);
    $("preview-sub").textContent = bits.join(" · ");
    const SHOW = 6;
    for (const t of p.trails.slice(0, SHOW)) {
      const li = el("li");
      li.append(el("span", "num-badge", `#${t.number}`), el("span", "", t.name));
      if (t.date) li.append(el("span", "when", t.date));
      list.append(li);
    }
    if (p.trails.length > SHOW) list.append(el("li", "more-line", `and ${p.trails.length - SHOW} more`));
    if (adding) {
      btn.disabled = false; // re-adding also fills in dates on trails already here
      btn.textContent = fresh.length ? `Add ${plural(fresh.length, "trail", "trails")}` : "Update dates";
    } else {
      btn.disabled = false;
      btn.textContent = "Create area";
    }
  }

  /** Merge trails into an area: new numbers come in; ones already here keep their notes. */
  async function mergeInto(area, trails, sheetLink, sheetTab) {
    const have = new Map(area.trails.map((t) => [t.number, t]));
    let added = 0, already = 0, dated = 0;
    const clashes = [];
    for (const t of trails) {
      const old = have.get(t.number);
      if (!old) {
        const nt = { number: t.number, name: t.name, date: t.date || "" };
        area.trails.push(nt);
        have.set(t.number, nt);
        await db.put("areacards", blankCard(area.id, nt));
        added++;
      } else if (old.name.toLowerCase() === t.name.toLowerCase()) {
        already++;
        if (t.date && t.date !== old.date) {
          old.date = t.date; // a date filled in since: keep it current
          dated++;
          const card = await db.get("areacards", cardKey(area.id, t.number));
          if (card) { card.date = t.date; await db.put("areacards", card); }
        }
      } else {
        clashes.push(`#${t.number} is "${old.name}" here`);
      }
    }
    area.trails.sort((x, y) => x.number - y.number);
    if (sheetLink) area.sheetLink = sheetLink;
    if (sheetTab) area.sheetTab = sheetTab;
    await saveAreas();
    return { added, already, dated, clashes };
  }

  function mergeMessage(m) {
    let msg = m.added ? `Added ${plural(m.added, "trail", "trails")}` : "No new trails";
    if (m.already) msg += `. ${m.already} already here`;
    if (m.dated) msg += `. ${plural(m.dated, "date", "dates")} filled in`;
    if (m.clashes.length) msg += `. Kept: ${m.clashes.slice(0, 2).join(", ")}${m.clashes.length > 2 ? "…" : ""}`;
    return msg + ".";
  }

  async function createArea(name, trails, sheetLink, sheetTab, stayHome) {
    const area = { id: `a${Date.now().toString(36)}`, name, trails: [...trails].sort((x, y) => x.number - y.number), sheetLink: sheetLink || "", sheetTab: sheetTab || "", at: Date.now() };
    for (const t of area.trails) await db.put("areacards", blankCard(area.id, t));
    state.areas.push(area);
    await saveAreas();
    if (stayHome) await renderAreas();
    else await openArea(area.id);
    toast(`${area.name}: ${plural(area.trails.length, "trail card", "trail cards")} ${stayHome ? "added" : "ready"}`);
    return area;
  }

  // ---------- Home: your sheet's areas (link once, tap one to add it) ----------

  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const dayClock = (t) => (new Date(t).toDateString() === new Date().toDateString() ? clock(t) : `${new Date(t).toLocaleDateString([], { month: "short", day: "numeric" })}, ${clock(t)}`);

  function renderSheetPanel() {
    const linked = !!state.sheetLink;
    $("sheet-unlinked").hidden = linked;
    $("sheet-linked").hidden = !linked;
    $("drawer-sheet").textContent = linked ? `Linked. ${state.sheetError ? "Can't be read right now." : state.sheetCheckedAt ? `Last checked ${dayClock(state.sheetCheckedAt)}.` : ""}` : "Not linked yet. Link it on the Home screen.";
    $("drawer-change-link").hidden = !linked;
    if (!linked) return;
    // is it still linked? green = read fine last time; red = couldn't read it; amber = not checked yet
    const dot = $("sheet-dot");
    dot.className = `link-dot ${state.sheetError ? "bad" : state.sheetCheckedAt ? "ok" : "idle"}`;
    $("sheet-state").textContent = state.sheetError ? "Trail sheet linked, but it can't be read" : "Trail sheet linked";
    $("sheet-checked").textContent = state.sheetError
      ? state.sheetError
      : state.sheetCheckedAt ? `Last checked ${dayClock(state.sheetCheckedAt)}${navigator.onLine ? "" : " · offline now"}` : "Not checked yet";
    const rb = $("sheet-refresh");
    if (rb.textContent !== "Checking…") { rb.disabled = !navigator.onLine; rb.textContent = navigator.onLine ? "Refresh" : "Offline"; }
    const box = $("sheet-areas");
    box.textContent = "";
    const list = state.sheetAreas || [];
    const todo = addable();
    for (const name of todo) {
      const n = state.sheetCounts[name] || 0;
      const b = el("button", "area-choice", `+ ${name} · ${plural(n, "trail", "trails")}`);
      b.type = "button";
      b.disabled = !navigator.onLine;
      b.addEventListener("click", () => addAreaFromSheet(name, b));
      box.append(b);
    }
    $("sheet-areas-note").textContent = !navigator.onLine && todo.length ? "needs signal to add" : "";
    if (!list.length && !state.sheetCheckedAt) $("sheet-areas-status").textContent = navigator.onLine ? "Reading your sheet…" : "Connect to see your sheet's areas.";
    else if (!todo.length) $("sheet-areas-status").textContent = `All locations synced${state.sheetCheckedAt ? ` · checked ${dayClock(state.sheetCheckedAt)}` : ""}. Areas show up here once they have trails.`;
    else $("sheet-areas-status").textContent = "Tap an area to add it with all its trails.";
    $("sheet-areas-status").className = "paste-status";
  }

  const onPhone = (n) => state.areas.some((a) => a.sheetTab === n || a.name.toLowerCase() === n.toLowerCase());
  /** Areas on the sheet that have trails and aren't on this phone yet. */
  const addable = () => (state.sheetAreas || []).filter((n) => !onPhone(n) && (state.sheetCounts[n] || 0) > 0);

  /** How many trails each area not on this phone has on its tab (empty tabs aren't offered). */
  async function countSheetTrails(link, list) {
    const counts = {};
    for (const name of list) {
      if (onPhone(name)) continue;
      counts[name] = parse.rowsToTrails(await fetchRows(link, name)).trails.length;
    }
    state.sheetCounts = counts;
    await db.put("kv", counts, "sheetCounts").catch(() => {});
  }

  async function refreshSheetAreas(byHand) {
    if (!state.sheetLink || !navigator.onLine) { renderSheetPanel(); return; }
    const rb = $("sheet-refresh");
    rb.disabled = true;
    rb.textContent = "Checking…";
    const before = addable().length;
    try {
      const list = parse.areasFromRows(await fetchRows(state.sheetLink, "Areas"));
      state.sheetAreas = list || [];
      if (list) await countSheetTrails(state.sheetLink, list);
      state.sheetError = list ? "" : "It has no Areas tab. Use the Trail Template.";
      state.sheetCheckedAt = Date.now();
      db.put("kv", state.sheetAreas, "sheetAreas").catch(() => {});
      db.put("kv", state.sheetCheckedAt, "sheetCheckedAt").catch(() => {});
      if (byHand === true && list) {
        const n = addable().length - before;
        toast(n > 0 ? `Found ${plural(n, "area", "areas")} with trails to add.` : "All locations synced.");
      }
    } catch (e) {
      state.sheetError = e.message;
    } finally {
      rb.textContent = "Refresh";
      renderSheetPanel();
    }
  }

  async function linkFromHome() {
    const link = $("home-link").value.trim();
    const say = (t, k) => { $("home-link-status").textContent = t; $("home-link-status").className = `paste-status ${k || ""}`; };
    const btn = $("home-link-btn");
    btn.disabled = true;
    btn.textContent = "Reading…";
    try {
      const list = parse.areasFromRows(await fetchRows(link, "Areas"));
      if (!list) throw new Error("That sheet has no Areas tab. Use the Trail Template (one tab per area).");
      await countSheetTrails(link, list);
      state.sheetLink = link;
      state.sheetAreas = list;
      state.sheetError = "";
      state.sheetCheckedAt = Date.now();
      await db.put("kv", link, "sheetLink");
      await db.put("kv", list, "sheetAreas");
      await db.put("kv", state.sheetCheckedAt, "sheetCheckedAt");
      say("");
      renderSheetPanel();
    } catch (e) {
      say(e.message, "warn");
    } finally {
      btn.disabled = false;
      btn.textContent = "Link the sheet";
    }
  }

  async function addAreaFromSheet(name, btn) {
    btn.disabled = true;
    btn.textContent = `Reading ${name}…`;
    try {
      const r = await fetchSheetTrails(state.sheetLink, name);
      await createArea(name, r.trails, state.sheetLink, name, true);
    } catch (e) {
      toast(e.message);
      renderSheetPanel();
    }
  }

  // ---------- deleting ----------

  /** A pop-up that asks before deleting. Resolves true if you tap Delete. */
  function confirmDelete(title, text, label) {
    return new Promise((resolve) => {
      const body = el("div");
      body.append(el("p", "confirm-text", text));
      const row = el("div", "confirm-row");
      const cancel = el("button", "btn-ghost", "Cancel");
      const del = el("button", "btn-danger solid", label);
      cancel.type = del.type = "button";
      let done = false;
      const finish = (v) => { if (done) return; done = true; closeSheet(); resolve(v); };
      cancel.addEventListener("click", () => finish(false));
      del.addEventListener("click", () => finish(true));
      row.append(cancel, del);
      body.append(row);
      openSheet(title, body);
      const off = () => { if (!done) { done = true; resolve(false); } };
      $("sheet-close").addEventListener("click", off, { once: true });
    });
  }

  async function leaveToList() {
    state.cards.set(state.current.number, state.current);
    await loadWaiting();
    renderArea();
    show("area");
  }

  async function completeTrail() {
    const card = state.current;
    const missing = missingList(card);
    if (missing.length) {
      const body = el("div");
      body.append(el("p", "confirm-text", "Still missing:"));
      const ul = el("ul", "missing-list");
      for (const m of missing) ul.append(el("li", "", m));
      body.append(ul);
      const row = el("div", "confirm-row");
      const back = el("button", "btn-ghost", "Keep working");
      const go = el("button", "btn-primary slim", "Save for later");
      back.type = go.type = "button";
      back.addEventListener("click", closeSheet);
      go.addEventListener("click", async () => { closeSheet(); await saveForLater(); });
      row.append(back, go);
      body.append(row);
      openSheet("Not everything is filled in", body);
      return;
    }
    await finishTrail();
  }

  // Not everything is filled in: keep the trail open and go back to the list. The sheet isn't touched.
  // One time only: an earlier update wrongly flipped Completed trails to In progress. Put those back.
  // (They still carry the date they were finished; trails saved for later never do.) Never runs again.
  async function restoreCompleted() {
    if (await db.get("kv", "restoredCompleted1")) return;
    for (const c of await db.all("areacards")) {
      if (c.status === "in-progress" && c.savedForLater && c.finishedAt) {
        const fixed = { ...c, status: "done", updatedAt: Date.now() };
        delete fixed.savedForLater;
        await db.put("areacards", fixed);
      }
    }
    await db.put("kv", true, "restoredCompleted1");
  }

  async function saveForLater() {
    const card = state.current;
    card.status = "in-progress";
    card.savedForLater = true;
    delete card.abandonReason;
    delete card.finishedAt;
    await saveCard();
    await leaveToList();
  }

  async function finishTrail() {
    const card = state.current;
    card.status = "done";
    delete card.savedForLater;
    delete card.abandonReason;
    card.finishedAt = Date.now();
    await saveCard();
    await leaveToList();
  }

  function abandonTrail() {
    const card = state.current;
    const body = el("div");
    body.append(el("p", "confirm-text", "Why couldn't you finish this trail?"));
    let reason = "";
    const bubbles = el("div", "bubbles");
    const go = el("button", "btn-warn", "Abandon trail");
    go.type = "button";
    go.disabled = true;
    for (const r of REASONS) {
      const b = el("button", "bubble", r);
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        reason = r;
        for (const x of bubbles.children) { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); }
        go.disabled = false;
      });
      bubbles.append(b);
    }
    go.addEventListener("click", async () => {
      card.status = "abandoned";
      card.abandonReason = reason;
      card.finishedAt = Date.now();
      await saveCard();
      closeSheet();
      await leaveToList();
    });
    const keep = el("button", "btn-ghost", "Keep this trail");
    keep.type = "button";
    keep.addEventListener("click", closeSheet);
    const row = el("div", "confirm-row");
    row.append(keep, go);
    body.append(bubbles, row);
    openSheet("Abandon this trail?", body);
  }

  async function deleteArea() {
    const a = state.area;
    const ok = await confirmDelete(`Delete ${a.name}?`, `This removes ${a.name} and its ${plural(a.trails.length, "trail card", "trail cards")} from this phone: answers, recordings, POIs and notes. Your Google Sheet isn't touched. This can't be undone.`, "Delete area");
    if (!ok) return;
    for (const c of await db.cardsIn(a.id)) await db.del("areacards", c.key);
    for (const r of await db.all("recordings")) if ((r.area || "") === a.id) await db.del("recordings", r.id);
    state.areas = state.areas.filter((x) => x.id !== a.id);
    await saveAreas();
    state.area = null;
    await renderAreas();
    show("areas");
    toast(`${a.name} deleted.`);
    if (a.sheetTab) refreshSheetAreas();   // it can be added back from the sheet
  }

  async function deleteTrail() {
    const a = state.area, card = state.current;
    const ok = await confirmDelete(`Delete #${card.number} ${card.name}?`, "This removes the trail card from this phone: its answers, recordings, POIs and notes. Your Google Sheet isn't touched. This can't be undone.", "Delete trail");
    if (!ok) return;
    await db.del("areacards", cardKey(a.id, card.number));
    for (const r of await db.byCard(a.id, card.number)) await db.del("recordings", r.id);
    a.trails = a.trails.filter((t) => t.number !== card.number);
    await saveAreas();
    await openArea(a.id);
    toast(`#${card.number} ${card.name} deleted.`);
  }

  /** New area, or merge into the open one. Returns false if something's missing. */
  async function commitTrails(trails, sheetLink, sheetTab) {
    if (state.startMode === "new") {
      const name = $("area-input").value.trim();
      if (!name) {
        toast("Name the area first.");
        $("area-input").focus();
        return false;
      }
      if (state.areas.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
        toast(`There's already an area called ${name}. Open it and use Add trails.`);
        return false;
      }
      state.pending = null;
      await createArea(name, trails, sheetLink, sheetTab);
      return true;
    }
    const m = await mergeInto(state.area, trails, sheetLink, sheetTab);
    state.pending = null;
    await openArea(state.area.id);
    toast(mergeMessage(m));
    return true;
  }

  async function createFromPending() {
    const p = state.pending;
    if (!p || !p.trails.length) return;
    await commitTrails(p.trails, p.link, p.tab);
  }

  /** One tab of a shared sheet as rows (tab "" = the tab in the link, or the first). Throws plain-words errors. */
  async function fetchRows(link, tab) {
    const sheet = parse.sheetFromLink(link);
    if (!sheet) throw new Error("Paste the sheet's full link (it has /spreadsheets/d/ in it).");
    if (!navigator.onLine) throw new Error("Reading the sheet needs signal. Pasting works offline.");
    let res;
    try {
      res = await fetch(parse.csvUrl(sheet, tab), { credentials: "omit" });
    } catch (e) {
      throw new Error('Couldn\'t reach that sheet. Check your signal, and that it\'s shared: Share, then General access: "Anyone with the link", Viewer.');
    }
    const type = res.headers.get("content-type") || "";
    if (!res.ok || /html/i.test(type)) {
      throw new Error('That sheet isn\'t shared. In Google Sheets: Share, then General access: "Anyone with the link", Viewer.');
    }
    return parse.parseCSV(await res.text());
  }

  /** The trails on one area's tab. */
  async function fetchSheetTrails(link, tab) {
    const rows = await fetchRows(link, tab);
    const r = parse.rowsToTrails(rows);
    r.area = tab || parse.areaFromRows(rows);
    if (!r.trails.length) {
      throw new Error(tab ? `No trails on the ${tab} tab yet. Add them in the sheet first.` : "No trails found in that sheet. It needs a number column and a name column.");
    }
    return r;
  }

  function saveSheetLink(link) {
    state.sheetLink = link;
    db.put("kv", link, "sheetLink").catch(() => {});
    $("link-row").hidden = true;
    $("change-link").hidden = false;
  }

  function sayImport(text, kind) {
    const status = $("import-status");
    status.textContent = text;
    status.className = `paste-status ${kind || ""}`;
  }

  /** Read the sheet: its list of areas (one tab each), or for Add trails, this area's tab. */
  async function importSheet() {
    const link = $("sheet-link").value.trim();
    const btn = $("import-btn");
    btn.disabled = true;
    btn.textContent = "Reading…";
    sayImport("");
    try {
      if (state.startMode === "add" && state.area.sheetTab) {
        await readAreaTab(link, state.area.sheetTab);
        return;
      }
      const list = parse.areasFromRows(await fetchRows(link, "Areas"));
      saveSheetLink(link);
      if (!list) {
        // an older sheet with one area and no Areas tab: read it as it is
        await readAreaTab(link, "");
        return;
      }
      state.areaList = list;
      renderAreaChoices();
      sayImport(list.length ? "Pick the area." : "The Areas tab is empty. Add your areas there.", list.length ? "ok" : "warn");
    } catch (e) {
      sayImport(e.message, "warn");
    } finally {
      btn.textContent = importLabel();
      renderNet();
    }
  }

  function renderAreaChoices() {
    const box = $("area-choices");
    box.textContent = "";
    box.hidden = !state.areaList;
    if (!state.areaList) return;
    for (const name of state.areaList) {
      const have = state.areas.find((a) => a.sheetTab === name || a.name.toLowerCase() === name.toLowerCase());
      const b = el("button", "area-choice", have ? `${name} (on this phone)` : name);
      b.type = "button";
      if (have && state.startMode === "new") b.disabled = true;
      if (state.pending && state.pending.tab === name) b.classList.add("on");
      b.addEventListener("click", () => readAreaTab($("sheet-link").value.trim(), name));
      box.append(b);
    }
  }

  async function readAreaTab(link, tab) {
    sayImport(tab ? `Reading ${tab}…` : "Reading…");
    try {
      const r = await fetchSheetTrails(link, tab);
      state.pending = { trails: r.trails, duplicates: r.duplicates || [], source: "sheet", link, tab };
      // the tab's name is the area's name, so a new area needs no typing
      if (state.startMode === "new" && r.area && !$("area-input").value.trim()) $("area-input").value = r.area;
      renderAreaChoices();
      renderPreview();
      sayImport(`Read ${plural(r.trails.length, "trail", "trails")}${tab ? ` from ${tab}` : ""}. Check them below, then tap ${state.startMode === "add" ? "Add" : "Create area"}.`, "ok");
      $("preview").scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (e) {
      sayImport(e.message, "warn");
    }
  }

  /** Area screen: re-read the area's saved sheet link and add any new trails. */
  async function checkSheet() {
    const a = state.area;
    const status = $("check-status");
    const say = (text, kind) => { status.textContent = text; status.className = `paste-status ${kind || ""}`; };
    if (!a || !a.sheetLink) return;
    const btn = $("check-sheet");
    btn.disabled = true;
    btn.textContent = "Checking…";
    say("");
    try {
      const r = await fetchSheetTrails(a.sheetLink, a.sheetTab || "");
      const m = await mergeInto(a, r.trails, a.sheetLink, a.sheetTab);
      state.cards = new Map((await db.cardsIn(a.id)).map((c) => [c.number, c]));
      renderArea();
      say(mergeMessage(m), m.added ? "ok" : "");
    } catch (e) {
      say(e.message, "warn");
    } finally {
      btn.textContent = "Check the sheet for new trails";
      renderNet();
    }
  }


  // ---------- one card ----------

  async function openCard(number) {
    const a = state.area;
    const t = a.trails.find((x) => x.number === number);
    const card = state.cards.get(number) || (await db.get("areacards", cardKey(a.id, number))) || blankCard(a.id, t);
    state.current = card;
    $("card-num").textContent = `#${card.number}`;
    $("card-name").textContent = card.name;
    $("card-date").textContent = card.date || "";
    $("said").value = "";
    await loadWaiting();
    $("start-from").value = card.startFrom || "";
    $("custom-area").checked = !!card.customArea;
    $("custom-area-text").hidden = !card.customArea;
    $("custom-area-text").value = card.customDesc || "";
    $("no-pois").checked = !!card.noPois;
    $("curator-on").checked = !!card.curatorOn;
    $("curator-text").hidden = !card.curatorOn;
    $("curator-text").value = card.curatorNote || "";
    $("lt-miles").value = card.milesText || "";
    $("lt-time").value = card.timeText || "";
    showLengthTime(card);
    setPaved(card.startPaved || "");
    $("marker-label").textContent = `Show marker #${card.number}`;
    renderMarkerNote();
    renderCard();
    await renderRecordings();
    show("card");
  }

  function showLengthTime(card) {
    const bits = [];
    if (card.miles > 0) bits.push(`${card.miles} ${card.miles === 1 ? "mile" : "miles"}`);
    if (card.hours > 0) {
      const mins = Math.round(card.hours * 60);
      bits.push(`${Math.floor(mins / 60) ? Math.floor(mins / 60) + " h " : ""}${mins % 60 ? (mins % 60) + " min" : ""}`.trim());
    }
    const need = [];
    if (!(card.miles > 0)) need.push("miles");
    if (!(card.hours > 0)) need.push("time");
    const typed = card.milesText || card.timeText;
    $("lt-read").textContent = typed ? `Read: ${bits.join(" · ") || "nothing yet"}${need.length ? ` (still need ${need.join(" and ")})` : ""}` : "";
  }

  async function saveCard() {
    const c = state.current;
    c.updatedAt = Date.now();   // anything newer than the last sync is waiting to go to Drive
    state.cards.set(c.number, c);
    await db.put("areacards", c);
  }

  function setPaved(v) {
    for (const b of $("start-paved").children) b.setAttribute("aria-pressed", String(b.dataset.v === v));
  }

  // What's still missing before this trail is really done, in plain words.
  function missingList(card) {
    const out = [];
    const paras = TN.summary.build({ ...card, areaText: areaTextFor(card) });
    out.push(...TN.summary.gaps(paras));
    if (!card.startPaved) out.push("paved or unpaved (where it starts)");
    if (needsEndsPaved(card) && !card.endsPaved) out.push("paved or unpaved (where it ends)");
    if (!(card.pois && card.pois.length) && !card.noPois) out.push("POIs (add one, or tick No POIs)");
    if (!(card.restrictions && card.restrictions.length)) out.push("seasonal or legal restrictions (pick any, or No Restrictions Found)");
    if (!(card.miles > 0)) out.push("length in miles");
    if (!(card.hours > 0)) out.push("time it took");
    if (hasWaiting(card)) out.push("a recording still to turn into text");
    for (const c of CRITERIA) {
      const a = card.answers[c.id];
      if (a && a.status === "unclear") out.push(`${c.label.toLowerCase()} needs checking`);
    }
    return [...new Set(out)];
  }

  function renderCard() {
    const card = state.current;
    const p = progress(card, state.area);
    const fin = card.status === "done" || card.status === "abandoned";
    $("complete-btn").hidden = fin;
    $("abandon-btn").hidden = fin;
    $("reopen-btn").hidden = !fin;
    $("complete-note").textContent = card.status === "abandoned" ? `Abandoned${card.abandonReason ? `: ${card.abandonReason}` : ""}` : card.status === "done" ? "Marked completed." : "";
    const ringBox = $("card-ring");
    ringBox.replaceWith(Object.assign(ring(p), { id: "card-ring" }));
    const list = $("checklist");
    list.textContent = "";
    for (const c of CRITERIA) {
      const a = card.answers[c.id];
      const b = el("button", `crit ${a ? a.status : ""}`);
      b.type = "button";
      const txt = el("span", "crit-text");
      txt.append(el("strong", "", c.label), el("span", "", a ? (a.status === "unclear" ? "Check this" : a.value) : "Not answered"));
      b.append(el("span", "light"), txt);
      b.setAttribute("aria-label", `${c.label}: ${a ? (a.status === "unclear" ? "check this" : a.value) : "not answered"}`);
      b.addEventListener("click", () => openCriterion(c));
      list.append(b);
    }
    renderPois();
    renderRestrictions();
  }

  // ---------- Seasonal or legal restrictions (same choices as the sheet's dropdown) ----------

  const RESTRICTIONS = ["Permit Required", "One Way Only", "Seasonal Restrictions", "No Restrictions Found"];
  const NO_RESTR = "No Restrictions Found";

  function renderRestrictions() {
    const card = state.current;
    const chosen = new Set(card.restrictions || []);
    const box = $("restr");
    box.textContent = "";
    for (const r of RESTRICTIONS) {
      const b = el("button", `bubble${chosen.has(r) ? " on" : ""}`, r);
      b.type = "button";
      b.setAttribute("aria-pressed", String(chosen.has(r)));
      b.addEventListener("click", async () => {
        const next = new Set(card.restrictions || []);
        if (next.has(r)) next.delete(r);
        else {
          if (r === NO_RESTR) next.clear();       // "none found" can't go with a restriction
          else next.delete(NO_RESTR);
          next.add(r);
        }
        card.restrictions = RESTRICTIONS.filter((x) => next.has(x));
        await saveCard();
        renderRestrictions();
        renderCard();
      });
      box.append(b);
    }
  }

  // ---------- Show marker: the number to hold up to the GoPro ----------

  function renderMarkerNote() {
    const shown = state.current.markerShown || [];
    const last = shown[shown.length - 1];
    $("marker-note").textContent = last
      ? `Shown at ${new Date(last).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. Tap the screen to close it.`
      : "Hold it up to the GoPro at the trailhead and take a photo. Tap the screen to close.";
  }

  // The marker page matches the screen: upright on a phone held upright (no turning).
  function markerSize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    return { w: 1100, h: Math.max(850, Math.round((1100 * vh) / vw)) };
  }
  function fitMarker() {
    const cv = $("marker-canvas");
    const vw = window.innerWidth, vh = window.innerHeight;
    const k = Math.min(vw / cv.width, vh / cv.height);
    cv.style.width = `${Math.floor(cv.width * k)}px`;
    cv.style.height = `${Math.floor(cv.height * k)}px`;
  }

  let wake = null;
  async function showMarker() {
    const card = state.current;
    const footer = `${state.area.name}  ·  #${card.number}  ·  ${card.name}`;
    const size = markerSize();
    const cv = $("marker-canvas");
    cv.width = size.w; cv.height = size.h;
    try {
      await TN.marker.draw(cv, card.number, footer);
    } catch (e) {
      toast("Couldn't draw the marker. Open the app once with signal so it can save the marker images.");
      return;
    }
    fitMarker();
    $("marker-wrap").hidden = false;
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch (e) { wake = null; }
    card.markerShown = [...(card.markerShown || []), Date.now()].slice(-10);
    await saveCard();
    renderMarkerNote();
  }

  async function showMarkerAgain() {   // phone turned while showing: redraw for the new shape
    const size = markerSize(), cv = $("marker-canvas"), card = state.current;
    cv.width = size.w; cv.height = size.h;
    await TN.marker.draw(cv, card.number, `${state.area.name}  ·  #${card.number}  ·  ${card.name}`).catch(() => {});
    fitMarker();
  }

  function hideMarker() {
    $("marker-wrap").hidden = true;
    if (wake) { wake.release().catch(() => {}); wake = null; }
  }

  // Set or check one criterion by hand.
  function openCriterion(c) {
    const card = state.current;
    const a = card.answers[c.id];
    const body = el("div");
    body.className = "sheet-body";
    body.append(el("p", "sheet-q", c.question));
    if (a && a.heard) {
      const h = el("div", "heard");
      h.append(el("em", "", a.status === "unclear" ? "You said a few things for this. Pick the right one:" : "What it heard"), document.createTextNode(`"${a.heard}"`));
      body.append(h);
    }
    const chosen = new Set(a && a.status === "answered" && !c.slider ? (a.values || [a.value]) : []);
    const heard = a && a.heard ? a.heard : "";
    const needsSave = !!(c.multi || c.slider || c.field);
    const EXCLUSIVE = ["None", "No significant obstacles", "Mostly flat"];
    const actions = el("div", "sheet-actions");
    let input = null, fieldBox = null, range = null;

    const syncField = () => { if (fieldBox) fieldBox.hidden = !!c.field.when && !chosen.has(c.field.when); };
    const save = async () => {
      if (c.slider) {
        card.answers[c.id] = { status: "answered", value: `${range.value}${c.slider.unit}`, number: Number(range.value), heard, by: "tap", at: Date.now() };
      } else {
        const values = c.options.map((o) => o.value).filter((v) => chosen.has(v));
        if (values.length) card.answers[c.id] = { status: "answered", value: values.join(", "), values, heard, by: "tap", at: Date.now() };
        else delete card.answers[c.id];
      }
      if (c.id === "ends") card.endsPaved = chosen.has("Connects to another path") ? endsPaved : "";
      if (c.field && input) {
        card[c.field.key] = input.value.trim();
        if (c.field.key === "startFrom") $("start-from").value = card.startFrom;
      }
      await saveCard();
      closeSheet();
      renderCard();
      renderSummary();
    };

    if (c.slider) {
      const wrap = el("div", "slider-box");
      const big = el("div", "slider-value");
      range = document.createElement("input");
      range.type = "range"; range.min = c.slider.min; range.max = c.slider.max; range.step = 1;
      range.setAttribute("aria-label", c.label);
      range.value = a && a.number ? a.number : Math.round((c.slider.min + c.slider.max) / 3);
      big.textContent = `${range.value}${c.slider.unit}`;
      range.addEventListener("input", () => { big.textContent = `${range.value}${c.slider.unit}`; });
      const ends = el("div", "slider-ends");
      ends.append(el("span", "", `${c.slider.min}${c.slider.unit}`), el("span", "", `${c.slider.max}${c.slider.unit}`));
      wrap.append(big, range, ends);
      body.append(wrap);
    } else {
      const bubbles = el("div", "bubbles");
      for (const o of c.options) {
        const b = el("button", "bubble", o.value);
        b.type = "button";
        if (chosen.has(o.value)) b.classList.add("on");
        if (a && a.status === "unclear" && (a.options || []).includes(o.value)) b.classList.add("suggest");
        b.setAttribute("aria-pressed", String(chosen.has(o.value)));
        b.addEventListener("click", async () => {
          if (c.multi) {
            if (chosen.has(o.value)) chosen.delete(o.value);
            else chosen.add(o.value);
            if (EXCLUSIVE.includes(o.value) && chosen.has(o.value)) [...chosen].forEach((v) => v !== o.value && chosen.delete(v));
            else EXCLUSIVE.forEach((v) => chosen.delete(v));
          } else if (needsSave) {
            chosen.clear(); chosen.add(o.value);
          } else {
            card.answers[c.id] = { status: "answered", value: o.value, heard, by: "tap", at: Date.now() };
            await saveCard();
            closeSheet();
            renderCard();
            return;
          }
          for (const x of bubbles.children) {
            x.classList.toggle("on", chosen.has(x.textContent));
            x.setAttribute("aria-pressed", String(chosen.has(x.textContent)));
          }
          syncField();
        });
        bubbles.append(b);
      }
      body.append(bubbles);
    }

    if (c.field) {
      fieldBox = el("div", "field-box");
      const lab = el("label", "small-label", c.field.label);
      input = document.createElement("input");
      input.type = "text"; input.autocomplete = "off"; input.placeholder = c.field.placeholder || "";
      input.value = card[c.field.key] || "";
      input.id = "crit-field";
      lab.htmlFor = "crit-field";
      fieldBox.append(lab, input);
      body.append(fieldBox);
      syncField();
    }

    // "Connects to another path": is that path paved or unpaved?
    let pavedBox = null, endsPaved = card.endsPaved || "";
    if (c.id === "ends") {
      pavedBox = el("div", "field-box");
      pavedBox.append(el("span", "small-label", "Is that path paved?"));
      const seg = el("div", "seg");
      for (const v of ["Paved", "Unpaved"]) {
        const sb = el("button", "", v);
        sb.type = "button";
        sb.dataset.v = v;
        sb.setAttribute("aria-pressed", String(endsPaved === v));
        sb.addEventListener("click", () => {
          endsPaved = endsPaved === v ? "" : v;
          for (const x of seg.children) x.setAttribute("aria-pressed", String(x.dataset.v === endsPaved));
        });
        seg.append(sb);
      }
      pavedBox.append(seg);
      body.append(pavedBox);
      const syncPaved = () => { pavedBox.hidden = !chosen.has("Connects to another path"); };
      syncPaved();
      body.addEventListener("click", syncPaved);
    }

    if (needsSave) {
      const done = el("button", "btn-primary slim", "Save");
      done.type = "button";
      done.addEventListener("click", save);
      actions.append(done);
    }
    if (a) {
      const clear = el("button", "btn-ghost", "Clear answer");
      clear.type = "button";
      clear.addEventListener("click", async () => {
        delete card.answers[c.id];
        await saveCard();
        closeSheet();
        renderCard();
      });
      actions.append(clear);
    }
    if (actions.children.length) body.append(actions);
    openSheet(c.label, body);
  }

  // ---------- reading what was said -> answers (with a Cancel) ----------

  let processing = null;

  function applyAnswers(card, text) {
    const found = pickAnswers(text);
    let lit = 0, unclear = 0;
    const items = []; // what was found, to show: [{ label, text, check }]
    for (const [id, a] of Object.entries(found)) {
      const old = card.answers[id];
      if (old && old.by === "tap" && old.status === "answered" && a.status === "unclear") continue; // don't undo your own pick
      card.answers[id] = { ...a, by: "voice", at: Date.now() };
      const crit = CRITERIA.find((c) => c.id === id);
      const label = crit ? crit.label : id;
      if (a.status === "answered") {
        lit++;
        items.push({ label, text: a.values && a.values.length ? a.values.join(", ") : a.value });
      } else {
        unclear++;
        items.push({ label, text: (a.options || []).join(" or "), check: true });
      }
    }
    if (!card.startFrom) {
      const from = TN.summary.startFromSpeech(text);
      if (from) { card.startFrom = from; $("start-from").value = from; }
    }
    if (!card.endsAt && TN.summary.endsAtSpeech) {
      const to = TN.summary.endsAtSpeech(text);
      if (to) card.endsAt = to;
    }
    if (!card.startPaved && criteria.pavedFromSpeech) {
      const v = criteria.pavedFromSpeech(text);
      if (v) { card.startPaved = v; setPaved(v); }
    }
    card.said.push({ text, at: Date.now() });
    return { lit, unclear, items };
  }

  // Before reading a message, keep what the card looked like, so "Delete message" can put it back.
  function snapCard(card) {
    return JSON.parse(JSON.stringify({ answers: card.answers, startFrom: card.startFrom || "", endsAt: card.endsAt || "", startPaved: card.startPaved || "", said: card.said }));
  }

  // The window shown after a message is read: how many answers it found (or none), what was heard,
  // and a way to delete the message right there.
  function showResult({ lit, unclear, items = [], text, before, recs = [] }) {
    const card = state.current;
    const found = lit + unclear;
    const body = el("div");
    if (!text) body.append(el("p", "confirm-text", "Couldn't hear any words in your recordings."));
    else if (!found) body.append(el("p", "confirm-text", "Try naming the criteria, or say it another way."));
    else {
      const list = el("ul", "found-list");
      for (const it of items) {
        const li = el("li");
        li.append(el("strong", "", it.label), document.createTextNode(it.check ? ` — to check: ${it.text}` : ` — ${it.text}`));
        list.append(li);
      }
      body.append(list);
    }
    if (text) body.append(el("p", "heard-text", `"${text}"`));
    if (text && found) body.append(el("p", "summary-gaps", "Deleting the message keeps the answers it found."));
    const row = el("div", "confirm-row");
    const del = el("button", "btn-warn", "Delete message");
    const ok = el("button", "btn-primary slim", "OK");
    del.type = ok.type = "button";
    ok.addEventListener("click", () => { closeSheet(); askForPath(); });
    del.addEventListener("click", async () => {
      card.said = before.said; // the message goes; the answers it found stay
      for (const r of recs) await db.del("recordings", r.id);
      await saveCard();
      closeSheet();
      renderCard();
      await loadWaiting();
      await renderRecordings();
      toast("Message deleted");
      askForPath();
    });
    row.append(del, ok);
    body.append(row);
    openSheet(!text ? "Nothing heard" : found ? `${plural(lit, "answer", "answers")} found${unclear ? `, ${unclear} to check` : ""}` : "No answers found", body, { noClose: true });
  }

  // Said "connects to another path" but not which one: open that question so the name can be typed.
  function askForPath() {
    const card = state.current;
    const a = card && card.answers && card.answers.ends;
    const has = a && a.status === "answered" && (a.values || [a.value]).includes("Connects to another path");
    if (!has || String(card.endsAt || "").trim()) return;
    const c = CRITERIA.find((x) => x.id === "ends");
    if (!c) return;
    setTimeout(() => {
      openCriterion(c);
      const f = $("crit-field");
      if (f) f.focus({ preventScroll: true });
    }, 250);
  }

  function processText(text) {
    const card = state.current;
    if (!text.trim()) {
      toast("Say or type something first.");
      return;
    }
    const body = el("div", "processing");
    body.append(loader(), el("p", "", "Reading what you said and finding the answers…"));
    const cancel = el("button", "btn-ghost", "Cancel");
    cancel.type = "button";
    body.append(cancel);
    const job = { cancelled: false };
    processing = job;
    cancel.addEventListener("click", () => {
      job.cancelled = true;
      closeSheet();
      toast("Cancelled. Nothing changed. Add more and try again.");
    });
    openWheel(body);
    // The real speech model will take a while; the answer-finding itself is quick.
    setTimeout(async () => {
      if (job.cancelled || processing !== job) return;
      const before = snapCard(card);
      const r = applyAnswers(card, text);
      await saveCard();
      closeSheet();
      renderCard();
      $("said").value = "";
      showResult({ ...r, text, before });
    }, 900);
  }

  // ---------- the big mic: record and save on the device ----------

  let rec = null; // { recorder, chunks, stream, started, timer }

  function pickMime() {
    if (!window.MediaRecorder) return "";
    for (const t of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  async function toggleMic() {
    if (rec) return stopMic();
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      toast("This browser can't record. Use the text box below.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      toast("The microphone is blocked. Allow it for this app in Settings, then try again.");
      return;
    }
    const mime = pickMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
    rec = { recorder, chunks, stream, started: Date.now(), mime: recorder.mimeType || mime || "audio/webm" };
    recorder.start(1000);
    const btn = $("mic-btn");
    btn.classList.add("recording");
    btn.setAttribute("aria-label", "Tap to stop");
    $("mic-label").textContent = "Tap to stop · 0:00";
    rec.timer = setInterval(() => ($("mic-label").textContent = `Tap to stop · ${fmtTime((Date.now() - rec.started) / 1000)}`), 500);
  }

  function stopMic() {
    const r = rec;
    rec = null;
    clearInterval(r.timer);
    const btn = $("mic-btn");
    btn.classList.remove("recording");
    btn.setAttribute("aria-label", "Tap to talk");
    $("mic-label").textContent = "Tap to talk";
    return new Promise((resolve) => {
      r.recorder.onstop = async () => {
        r.stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(r.chunks, { type: r.mime });
        const seconds = (Date.now() - r.started) / 1000;
        if (!blob.size) {
          toast("Nothing was recorded. Try again.");
          return resolve();
        }
        const buffer = await blob.arrayBuffer();
        await db.put("recordings", { area: state.current.area, card: state.current.number, buffer, mime: r.mime, seconds, at: Date.now(), status: "waiting" });
        await renderRecordings();   // saved; record more, then tap "Translate to text"
        resolve();
      };
      r.recorder.stop();
    });
  }

  let playing = null;
  async function renderRecordings() {
    await loadWaiting();
    const box = $("recordings");
    box.textContent = "";
    const list = (await db.byCard(state.current.area, state.current.number)).sort((a, b) => a.at - b.at);
    list.forEach((r, i) => {
      const wrap = el("div", "rec-wrap");
      const row = el("div", "rec");
      const play = el("button", "play");
      play.type = "button";
      play.setAttribute("aria-label", `Play recording ${i + 1}`);
      play.append(icon(ICON.play));
      play.addEventListener("click", () => {
        if (playing) {
          playing.pause();
          URL.revokeObjectURL(playing.src);
          const was = playing.dataset.id;
          playing = null;
          if (was === String(r.id)) return;
        }
        const audio = new Audio(URL.createObjectURL(new Blob([r.buffer], { type: r.mime })));
        audio.dataset.id = String(r.id);
        audio.onended = () => (playing = null);
        playing = audio;
        audio.play().catch(() => toast("Couldn't play that recording."));
      });
      const text = el("div", "rec-text");
      text.append(
        el("strong", "", `Recording ${i + 1} · ${fmtTime(r.seconds)}`),
        el("span", "", r.status === "processed" ? "Turned into text" : "Saved · not turned into text yet")
      );
      const del = el("button", "icon-btn");
      del.type = "button";
      del.setAttribute("aria-label", `Delete recording ${i + 1}`);
      del.append(icon(ICON.trash));
      del.addEventListener("click", async () => {
        if (!confirmInline(del)) return;
        await db.del("recordings", r.id);
        await renderRecordings();
      });
      row.append(play, text, del);
      wrap.append(row);
      if (r.status === "processed" && r.transcript) wrap.append(el("p", "rec-said", `"${r.transcript}"`));
      box.append(wrap);
    });
    const waiting = list.filter((r) => r.status !== "processed").length;
    const tb = $("translate-btn");
    tb.hidden = !waiting;
    tb.textContent = waiting > 1 ? `Translate to text (${waiting} messages)` : "Translate to text";
  }

  /** Speech-to-text for every saved message on this trail, back to back, then light up the answers once. Cancel any time. */
  async function processRecordings() {
    if (processing) return;
    const card = state.current;
    const list = (await db.byCard(card.area, card.number)).filter((r) => r.status !== "processed").sort((a, b) => a.at - b.at);
    if (!list.length) { toast("Record a message first."); return; }
    const body = el("div", "processing");
    const label = el("p", "", "Getting ready…");
    const bar = el("div", "progress");
    const fill = el("div");
    bar.append(fill);
    bar.hidden = true;
    const timer = el("p", "", "0:00");
    const cancel = el("button", "btn-ghost", "Cancel");
    cancel.type = "button";
    body.append(loader(), label, bar, timer, cancel);
    const started = Date.now();
    const tick = setInterval(() => (timer.textContent = fmtTime((Date.now() - started) / 1000)), 500);
    let cancelled = false;
    const job = { cancelled: false };
    processing = job;
    cancel.addEventListener("click", () => {
      cancelled = true;
      stt.cancel();
    });
    openWheel(body);
    const part = (i) => (list.length > 1 ? `Message ${i + 1} of ${list.length}: ` : "");
    try {
      const texts = [];
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        const text = await stt.transcribe(r.buffer, r.mime, (p) => {
          if (p.phase === "download") {
            bar.hidden = false;
            const pct = p.total ? Math.round((p.loaded / p.total) * 100) : 0;
            fill.style.width = `${pct}%`;
            label.textContent = `Downloading the speech model (once): ${pct}%`;
          } else if (p.phase === "decode") {
            bar.hidden = true;
            label.textContent = `${part(i)}Reading your recording…`;
          } else if (p.phase === "listen") {
            bar.hidden = true;
            label.textContent = `${part(i)}Listening to what you said… this can take a few minutes.`;
          }
        });
        if (cancelled) throw Object.assign(new Error("Stopped"), { code: "CANCELLED" });
        texts.push(text || "");
      }
      clearInterval(tick);
      for (let i = 0; i < list.length; i++) {
        list[i].status = "processed";
        list[i].transcript = texts[i];
        await db.put("recordings", list[i]);
      }
      const text = texts.filter(Boolean).join(" ").trim();
      const before = snapCard(card);
      const found = text ? applyAnswers(card, text) : { lit: 0, unclear: 0 };
      await saveCard();
      processing = null;
      closeSheet();
      renderCard();
      await renderRecordings();
      renderModelStatus();
      showResult({ ...found, text, before, recs: list });
    } catch (e) {
      clearInterval(tick);
      processing = null;
      closeSheet();
      await renderRecordings();
      if (e.code === "CANCELLED") toast("Stopped. Your messages are saved. Tap Translate to text when you're ready.");
      else toast(e.message);
    }
  }

  // Two taps to delete: the first arms the button, the second deletes.
  function confirmInline(btn) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = "1";
    btn.setAttribute("aria-label", "Tap again to delete");
    btn.style.background = "color-mix(in srgb, var(--red) 25%, transparent)";
    toast("Tap again to delete");
    setTimeout(() => {
      delete btn.dataset.armed;
      btn.style.background = "";
    }, 2500);
    return false;
  }

  // ---------- POIs ----------

  const POI_TYPES = ["Creek crossing", "Lake or river", "Viewpoint", "Campsite", "Hiking trail", "Developed campground", "Lookout tower",
    "Historic landmark", "Parking/staging area", "Restroom/pit toilet", "Waterfall", "Swimming hole", "Hot spring", "Water source",
    "Road closure barrier", "Other"];

  function renderSummary() {
    const card = state.current;
    const paras = TN.summary.build({ ...card, areaText: areaTextFor(card) });
    const box = $("summary");
    box.textContent = "";
    for (const para of paras) {
      if (!para.length) continue;
      const pEl = el("p");
      for (const piece of para) pEl.append(piece.gap ? el("mark", "", piece.gap) : piece.curator ? el("strong", "curator-note", piece.text) : document.createTextNode(piece.text));
      box.append(pEl);
    }
    const missing = TN.summary.gaps(paras);
    $("summary-gaps").textContent = missing.length
      ? `Highlighted: ${missing.length} still missing. Talk about them or tap a criterion.`
      : "Complete.";
  }

  function renderPois() {
    const card = state.current;
    renderSummary();
    $("poi-head").textContent = card.pois.length ? `POIs · ${card.pois.length}` : "POIs";
    $("no-pois").checked = !!card.noPois;
    $("no-pois").disabled = card.pois.length > 0;
    const pr = progress(card, state.area);
    const box = $("poi-list");
    box.textContent = "";
    if (!card.pois.length) {
      box.append(el("span", "empty-note", card.noPois ? "No POIs on this trail." : "None yet. Tap + to add some, or tick No POIs."));
      return;
    }
    card.pois.forEach((p, i) => {
      const row = el("div", "poi");
      const text = el("div", "poi-text");
      text.append(el("strong", "", p.type));
      if (p.note) text.append(el("span", "", p.note));
      const del = el("button", "icon-btn");
      del.type = "button";
      del.setAttribute("aria-label", `Delete POI ${p.type}`);
      del.append(icon(ICON.trash));
      del.addEventListener("click", async () => {
        if (!confirmInline(del)) return;
        card.pois.splice(i, 1);
        await saveCard();
        renderPois();
      });
      row.append(icon(ICON.pin), text, del);
      box.append(row);
    });
  }

  function addPoi() {
    const body = el("div", "sheet-body");
    const picked = new Set();
    const bubbles = el("div", "bubbles");
    body.append(el("span", "small-label", "What is it? Pick as many as you like."));
    const noteBox = el("div");
    const label = el("label", "small-label", "Its name (e.g. Pine Creek). The summary uses it. Only for one POI at a time.");
    const note = el("textarea");
    note.rows = 2;
    note.id = "poi-note";
    label.htmlFor = "poi-note";
    noteBox.append(label, note);
    noteBox.hidden = true;
    const save = el("button", "btn-primary slim", "Add POI");
    save.type = "button";
    save.disabled = true;
    const sync = () => {
      for (const x of bubbles.children) {
        x.classList.toggle("on", picked.has(x.textContent));
        x.setAttribute("aria-pressed", String(picked.has(x.textContent)));
      }
      noteBox.hidden = picked.size !== 1;
      if (picked.size !== 1) note.value = "";
      save.disabled = picked.size === 0;
      save.textContent = picked.size > 1 ? `Add ${picked.size} POIs` : "Add POI";
    };
    for (const t of POI_TYPES) {
      const b = el("button", "bubble", t);
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => { picked.has(t) ? picked.delete(t) : picked.add(t); sync(); });
      bubbles.append(b);
    }
    save.addEventListener("click", async () => {
      const types = POI_TYPES.filter((t) => picked.has(t));
      const nm = note.value.trim();
      for (const type of types) state.current.pois.push({ type, note: types.length === 1 ? nm : "", at: Date.now() });
      state.current.noPois = false;
      await saveCard();
      closeSheet();
      renderPois();
      renderCard();
      toast(types.length > 1 ? `${types.length} POIs added` : "POI added");
    });
    body.append(bubbles, noteBox, save);
    openSheet("Add POIs", body);
  }

  // ---------- the pop-up sheet ----------

  let sheetReturn = null;
  function openSheet(title, body, opts = {}) {
    $("sheet-title").textContent = title;
    const box = $("sheet-body");
    box.replaceWith(Object.assign(body, { id: "sheet-body" }));
    body.classList.add("sheet-body");
    $("sheet-close").hidden = !!opts.noClose;
    sheetReturn = document.activeElement;
    $("sheet-wrap").hidden = false;
    const first = body.querySelector("button, textarea, input");
    if (first && !opts.noClose) first.focus({ preventScroll: true });
  }
  // The wheel on top of the page (waiting screens). body = the .processing block with the wheel, text, Cancel.
  function openWheel(body) {
    $("wheel-box").textContent = "";
    $("wheel-box").append(body);
    $("wheel-overlay").hidden = false;
  }
  function closeWheel() { $("wheel-overlay").hidden = true; }

  function closeSheet() {
    closeWheel();
    $("sheet-wrap").hidden = true;
    processing = null;
    if (sheetReturn && sheetReturn.focus) sheetReturn.focus({ preventScroll: true });
  }

  // ---------- side menu (swipe from the left edge) ----------

  function setDrawer(open) {
    const d = $("drawer");
    d.classList.toggle("open", open);
    d.setAttribute("aria-hidden", String(!open));
    $("scrim").hidden = !open;
    if (open) (d.querySelector(".theme-opt[aria-checked='true']") || d.querySelector("button")).focus({ preventScroll: true });
  }

  function wireSwipe() {
    const d = $("drawer");
    let start = null;
    const width = () => d.getBoundingClientRect().width;
    document.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      const open = d.classList.contains("open");
      if ((!open && t.clientX < 28) || (open && t.clientX < width() + 10)) {
        start = { x: t.clientX, y: t.clientY, open, moved: false };
      }
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      if (!start.moved && Math.abs(dy) > Math.abs(dx)) { start = null; return; }
      start.moved = true;
      d.classList.add("dragging");
      const w = width();
      const pos = Math.max(-w, Math.min(0, (start.open ? 0 : -w) + dx));
      d.style.transform = `translateX(${pos}px)`;
      $("scrim").hidden = false;
    }, { passive: true });
    document.addEventListener("touchend", (e) => {
      if (!start) return;
      const dx = e.changedTouches[0].clientX - start.x;
      d.classList.remove("dragging");
      d.style.transform = "";
      if (start.moved) setDrawer(start.open ? dx > -60 : dx > 60);
      start = null;
    });
  }

  function applyTheme(name) {
    const t = ["green", "mono", "dusk"].includes(name) ? name : "green";
    document.documentElement.setAttribute("data-theme", t);
    for (const b of document.querySelectorAll(".theme-opt")) b.setAttribute("aria-checked", String(b.dataset.theme === t));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#0d140f");
    try { localStorage.setItem("tn-theme", t); } catch (e) { /* private mode: theme just isn't remembered */ }
  }

  // ---------- speech model status (side menu) ----------

  function renderModelStatus() {
    const ready = stt.isReady();
    const note = $("model-status");
    note.textContent = ready ? (state.bundled ? "Installed with the app. Works offline." : "Ready. Works offline on this phone.") : "Not downloaded yet. About 80 MB, once, with signal. After that it works offline.";
    note.classList.toggle("ready", ready);
    $("model-btn").hidden = ready;
  }

  async function downloadModel() {
    const btn = $("model-btn");
    btn.disabled = true;
    btn.textContent = "Downloading…";
    try {
      await stt.download((p) => {
        if (p.phase === "download" && p.total) $("model-status").textContent = `Downloading: ${Math.round((p.loaded / p.total) * 100)}%`;
      });
      toast("Speech model ready. It works offline now.");
    } catch (e) {
      toast(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Download now";
      renderModelStatus();
    }
  }

  // ---------- start up ----------

  /** Version 0.1 kept one list with no area: move it into an area called "My trails". */
  async function migrateOldList() {
    const old = await db.get("kv", "list");
    if (!old || !old.trails || !old.trails.length) return;
    const area = { id: "a0", name: old.area || "My trails", trails: old.trails, sheetLink: "", at: Date.now() };
    for (const c of await db.all("cards")) {
      await db.put("areacards", { ...c, key: cardKey(area.id, c.number), area: area.id, areaDesc: c.area || "" });
    }
    for (const r of await db.all("recordings")) {
      if (!r.area) await db.put("recordings", { ...r, area: area.id });
    }
    state.areas.push(area);
    await saveAreas();
    await db.del("kv", "list");
  }

  async function start() {
    let saved = "green";
    try { saved = localStorage.getItem("tn-theme") || "green"; } catch (e) { /* ignore */ }
    applyTheme(saved);

    document.querySelectorAll(".menu-btn").forEach((b) => b.addEventListener("click", () => setDrawer(true)));
    $("scrim").addEventListener("click", () => setDrawer(false));
    document.querySelectorAll(".theme-opt").forEach((b) => b.addEventListener("click", () => applyTheme(b.dataset.theme)));
    $("model-btn").addEventListener("click", downloadModel);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("marker-wrap").hidden) hideMarker();
      else if (!$("sheet-wrap").hidden && !$("sheet-close").hidden) closeSheet();
      else if ($("drawer").classList.contains("open")) setDrawer(false);
    });
    wireSwipe();

    $("new-area").addEventListener("click", () => openStart("new"));
    $("add-trails").addEventListener("click", () => openStart("add"));
    $("area-back").addEventListener("click", async () => { if (state.saveDesc) await state.saveDesc(); await renderAreas(); show("areas"); });
    $("start-back").addEventListener("click", async () => {
      if (state.back === "area") show("area");
      else { await renderAreas(); show("areas"); }
    });
    $("paste").addEventListener("input", readPaste);
    $("paste-btn").addEventListener("click", pasteFromClipboard);
    $("home-link-btn").addEventListener("click", linkFromHome);
    $("sheet-refresh").addEventListener("click", () => refreshSheetAreas(true));
    $("drawer-change-link").addEventListener("click", async () => {
      state.sheetLink = "";
      state.sheetAreas = [];
      state.sheetCounts = {};
      state.sheetError = "";
      state.sheetCheckedAt = 0;
      await db.del("kv", "sheetLink").catch(() => {});
      await db.del("kv", "sheetCheckedAt").catch(() => {});
      $("home-link").value = "";
      setDrawer(false);
      await renderAreas();
      show("areas");
      $("home-link").focus();
      toast("Paste the new sheet's link on Home.");
    });
    $("area-delete").addEventListener("click", deleteArea);
    $("trail-delete").addEventListener("click", deleteTrail);
    window.addEventListener("online", () => refreshSheetAreas());
    window.addEventListener("offline", renderSheetPanel);
    $("change-link").addEventListener("click", () => {
      $("link-row").hidden = false;
      $("change-link").hidden = true;
      $("sheet-link").value = "";
      $("sheet-link").focus();
      state.areaList = null;
      renderAreaChoices();
      renderNet();
    });
    $("build-btn").addEventListener("click", createFromPending);
    $("check-sheet").addEventListener("click", checkSheet);
    $("import-btn").addEventListener("click", importSheet);
    $("card-back").addEventListener("click", () => { renderArea(); show("area"); });
    $("mic-btn").addEventListener("click", toggleMic);
    $("translate-btn").addEventListener("click", processRecordings);
    $("marker-btn").addEventListener("click", showMarker);
    let fromTimer = null;
    $("start-from").addEventListener("input", () => {
      clearTimeout(fromTimer);
      state.current.startFrom = $("start-from").value.trim();
      renderSummary();
      fromTimer = setTimeout(async () => { await saveCard(); renderCard(); }, 400);
    });
    $("marker-wrap").addEventListener("click", hideMarker);
    window.addEventListener("resize", () => { if (!$("marker-wrap").hidden) showMarkerAgain(); });
    TN.marker.assets().catch(() => {});   // load the marker images early so they're ready offline
    $("process-btn").addEventListener("click", () => processText($("said").value));
    $("poi-add").addEventListener("click", addPoi);
    $("sheet-close").addEventListener("click", closeSheet);
    $("sheet-wrap").addEventListener("click", (e) => { if (e.target === $("sheet-wrap") && !$("sheet-close").hidden) closeSheet(); });
    const descDirty = () => ($("area-desc").value.trim() !== String((state.area && state.area.desc) || "").trim());
    const descButton = () => {
      const dirty = descDirty();
      $("area-desc-save").disabled = !dirty;
      $("area-desc-save").textContent = dirty ? "Save description" : "Saved";
    };
    state.saveDesc = async () => {
      if (!state.area || !descDirty()) return;
      state.area.desc = $("area-desc").value.trim();
      await saveAreas();
      descButton();
      toast("Area description saved");
    };
    $("area-desc").addEventListener("input", descButton);
    $("area-desc-save").addEventListener("click", state.saveDesc);
    state.descButton = descButton;
    for (const b of $("start-paved").children) {
      b.addEventListener("click", async () => {
        const c = state.current;
        c.startPaved = c.startPaved === b.dataset.v ? "" : b.dataset.v;
        setPaved(c.startPaved);
        await saveCard();
        renderCard(); renderSummary();
      });
    }
    $("custom-area").addEventListener("change", async () => {
      const c = state.current;
      c.customArea = $("custom-area").checked;
      $("custom-area-text").hidden = !c.customArea;
      if (c.customArea) $("custom-area-text").focus();
      await saveCard();
      renderCard(); renderSummary();
    });
    let customTimer = null;
    $("custom-area-text").addEventListener("input", () => {
      clearTimeout(customTimer);
      state.current.customDesc = $("custom-area-text").value;
      renderSummary();
      customTimer = setTimeout(async () => { await saveCard(); renderCard(); }, 400);
    });
    $("no-pois").addEventListener("change", async () => {
      state.current.noPois = $("no-pois").checked;
      await saveCard();
      renderPois(); renderCard();
    });
    $("curator-on").addEventListener("change", async () => {
      const c = state.current;
      c.curatorOn = $("curator-on").checked;
      $("curator-text").hidden = !c.curatorOn;
      if (c.curatorOn) $("curator-text").focus();
      await saveCard();
      renderSummary();
    });
    let curTimer = null;
    $("curator-text").addEventListener("input", () => {
      clearTimeout(curTimer);
      state.current.curatorNote = $("curator-text").value;
      renderSummary();
      curTimer = setTimeout(saveCard, 400);
    });
    const ltChanged = () => {
      const c = state.current;
      c.milesText = $("lt-miles").value;
      c.timeText = $("lt-time").value;
      c.miles = TN.parse.parseMiles(c.milesText);
      c.hours = TN.parse.parseHours(c.timeText);
      showLengthTime(c);
      clearTimeout(ltTimer);
      ltTimer = setTimeout(async () => { await saveCard(); renderCard(); }, 500);
    };
    let ltTimer = null;
    $("lt-miles").addEventListener("input", ltChanged);
    $("lt-time").addEventListener("input", ltChanged);
    $("complete-btn").addEventListener("click", completeTrail);
    $("abandon-btn").addEventListener("click", abandonTrail);
    $("reopen-btn").addEventListener("click", async () => {
      delete state.current.status; delete state.current.abandonReason;
      await saveCard();
      renderCard();
      toast("Trail reopened");
    });
    window.addEventListener("online", () => { renderNet(); renderSync().then(() => state.syncWaiting && runSync(true)); });
    window.addEventListener("offline", () => { renderNet(); renderSync(); });
    // Any button that says "Checking…", "Reading…", "Downloading…" gets the little topo loader in front.
    let tweaking = false;
    const dress = (btn) => {
      const busy = /…$/.test(btn.textContent.trim());
      const has = btn.querySelector(":scope > .spinner");
      if (busy && !has) btn.prepend(loader(true));
      else if (!busy && has) has.remove();
    };
    new MutationObserver((muts) => {
      if (tweaking) return;
      tweaking = true;
      for (const m of muts) {
        const b = (m.target.nodeType === 1 ? m.target : m.target.parentElement);
        const btn = b && b.closest && b.closest("button");
        if (btn) dress(btn);
      }
      tweaking = false;
    }).observe(document.body, { childList: true, characterData: true, subtree: true });
    $("sync-btn").addEventListener("click", () => runSync(false));
    $("drawer-switch").addEventListener("click", () => { drive.signOut(); drive.signIn(true); });   // Google asks which account
    $("drawer-signout").addEventListener("click", async () => { drive.signOut(); setDrawer(false); await renderSync(); toast("Signed out of Google."); });
    const back = drive.handleReturn();
    renderNet();
    renderModelStatus();
    if (stt.checkBundled) stt.checkBundled().then((b) => { if (b) { state.bundled = true; renderModelStatus(); } });

    // Ask the phone to keep our data (installed apps usually get this).
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((ok) => { if (ok) $("storage-note").textContent = "Saved on this device · kept safe"; }).catch(() => {});
    }

    state.areas = (await db.get("kv", "areas")) || [];
    state.sheetLink = (await db.get("kv", "sheetLink")) || "";
    state.sheetAreas = (await db.get("kv", "sheetAreas")) || [];
    state.sheetCheckedAt = (await db.get("kv", "sheetCheckedAt")) || 0;
    state.sheetCounts = (await db.get("kv", "sheetCounts")) || {};
    state.sheetError = "";
    await migrateOldList();
    await restoreCompleted();
    await renderAreas();
    show("areas");
    refreshSheetAreas();   // check the sheet for areas each time the app opens
    if (back === "signed-in") { toast("Signed in to Google."); drive.fetchAccount().then(() => renderSync()).then(() => runSync(false)); }
    else if (back.startsWith("error:")) toast(`Google sign-in didn't work (${back.slice(6)}).`);
    else if (drive.tokenValid() && navigator.onLine) {   // already signed in: send what's waiting
      if (!drive.account()) drive.fetchAccount().then(() => renderSync());
      runSync(true);
    }

    if ("serviceWorker" in navigator) {
      // When an update finishes installing, reload once so the new version shows right away.
      const hadOne = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadOne || reloaded || rec || !$("sheet-wrap").hidden) return; // never mid-recording or mid-processing
        reloaded = true;
        location.reload();
      });
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  start().catch((e) => {
    document.body.textContent = `Trail Notes couldn't start: ${e.message}`;
  });
})();
