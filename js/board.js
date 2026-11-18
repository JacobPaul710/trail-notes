"use strict";
// Hall of Scouts: the team leaderboard. Numbers are worked out on the phone from finished trails,
// then sent to Firebase (Firestore, over its plain web address, no extra library) under the scout's username.
(function (root) {
  const SEASON = 2026;
  const AUTH = "tn-board-auth";   // { idToken, refreshToken, uid, exp }
  const cfg = () => (root.TN && root.TN.config && root.TN.config.FIREBASE) || {};
  const ready = () => !!(cfg().apiKey && cfg().projectId);
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const del = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };

  // ---------- the numbers (pure, no network) ----------
  const pad = (n) => String(n).padStart(2, "0");
  const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const monthKey = (ms) => dayKey(ms).slice(0, 7);

  /** A finished, driven trail: completed (not "Not completed") with a finish time. */
  const counts = (c) => !!c && c.status === "done" && c.finishedAt && (!c.outcome || c.outcome === "drivable");

  function computeStats(cards, now = Date.now()) {
    const done = (cards || []).filter(counts);
    const perDay = new Map(), perMonth = new Map();
    let miles = 0, longest = 0, season = 0;
    for (const c of done) {
      const m = c.miles > 0 ? Number(c.miles) : 0;
      miles += m;
      if (m > longest) longest = m;
      if (new Date(c.finishedAt).getFullYear() === SEASON) season++;
      perDay.set(dayKey(c.finishedAt), (perDay.get(dayKey(c.finishedAt)) || 0) + 1);
      perMonth.set(monthKey(c.finishedAt), (perMonth.get(monthKey(c.finishedAt)) || 0) + 1);
    }
    // streak: days in a row with at least one trail, counting back from today (or yesterday, if none yet today)
    let streak = 0;
    const d = new Date(now);
    if (!perDay.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
    while (perDay.has(dayKey(d.getTime()))) { streak++; d.setDate(d.getDate() - 1); }
    return {
      trails: done.length, season, miles: Math.round(miles * 100) / 100, longest: Math.round(longest * 100) / 100,
      bestDay: Math.max(0, ...perDay.values()), bestMonth: Math.max(0, ...perMonth.values()), streak,
    };
  }

  const TABS = [
    { id: "longest", label: "Longest run", field: "longest", unit: "mi" },
    { id: "season", label: `${SEASON} season total`, field: "season", unit: "trails" },
    { id: "day", label: "Most in a day", field: "bestDay", unit: "trails" },
    { id: "month", label: "Most in a month", field: "bestMonth", unit: "trails" },
  ];
  /** Rows for one tab: highest first, ties broken by name, scouts with 0 left out. Adds rank. */
  function rank(scouts, field) {
    return (scouts || []).filter((s) => Number(s[field]) > 0)
      .sort((a, b) => Number(b[field]) - Number(a[field]) || String(a.username).localeCompare(String(b.username)))
      .map((s, i, arr) => ({ ...s, rank: i > 0 && Number(arr[i - 1][field]) === Number(s[field]) ? null : i + 1 }))
      .map((s, i, arr) => ({ ...s, rank: s.rank || arr[i - 1].rank }));
  }

  // ---------- Firestore plumbing ----------
  const enc = (v) => (typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : { stringValue: String(v) });
  const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
  const fromDoc = (d) => {
    const o = {};
    for (const [k, v] of Object.entries((d && d.fields) || {})) o[k] = "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue : v.stringValue;
    return o;
  };
  const base = () => `https://firestore.googleapis.com/v1/projects/${cfg().projectId}/databases/(default)/documents`;
  const authErr = (m) => Object.assign(new Error(m || "Sign in with Google again."), { code: "AUTH" });

  const saved = () => { try { return JSON.parse(get(AUTH) || "null"); } catch (e) { return null; } };
  const signedIn = () => { const a = saved(); return !!(a && a.uid && a.refreshToken); };
  const signOut = () => del(AUTH);
  const uid = () => (saved() || {}).uid || "";

  /** Trade the Google sign-in the app already has for a Firebase sign-in. */
  async function signIn(googleToken) {
    if (!ready()) throw new Error("The Hall of Scouts isn't set up yet.");
    if (!googleToken) throw authErr();
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${cfg().apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postBody: `access_token=${googleToken}&providerId=google.com`, requestUri: location.origin || "http://localhost", returnSecureToken: true, returnIdpCredential: true }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.idToken) throw new Error((j.error && j.error.message) ? `Firebase said: ${j.error.message}` : "Couldn't sign in to the Hall of Scouts.");
    set(AUTH, JSON.stringify({ idToken: j.idToken, refreshToken: j.refreshToken, uid: j.localId, exp: Date.now() + Number(j.expiresIn || 3600) * 1000 }));
    return j.localId;
  }

  async function idToken() {
    const a = saved();
    if (!a) throw authErr();
    if (a.exp > Date.now() + 60000) return a.idToken;
    const res = await fetch(`https://securetoken.googleapis.com/v1/token?key=${cfg().apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(a.refreshToken)}`,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.id_token) { del(AUTH); throw authErr(); }
    set(AUTH, JSON.stringify({ idToken: j.id_token, refreshToken: j.refresh_token || a.refreshToken, uid: j.user_id || a.uid, exp: Date.now() + Number(j.expires_in || 3600) * 1000 }));
    return j.id_token;
  }

  async function api(path, opts = {}) {
    const res = await fetch(`${base()}/${path}`, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${await idToken()}`, "Content-Type": "application/json" } });
    if (res.status === 401) { del(AUTH); throw authErr(); }
    return res;
  }

  const NAME_OK = /^[A-Za-z0-9_]{3,16}$/;
  const nameProblem = (n) => NAME_OK.test(n || "") ? "" : "Use 3 to 16 letters, numbers or underscores.";

  /** This scout's saved profile ({ username, ...numbers }) or null if they haven't picked a name yet. */
  async function me() {
    const res = await api(`scouts/${uid()}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("Couldn't reach the Hall of Scouts.");
    const p = fromDoc(await res.json());
    return p.username ? p : null;
  }

  /** Claim a username (each is unique, case doesn't matter). Returns "" on success, or the reason. */
  async function claim(name) {
    const bad = nameProblem(name);
    if (bad) return bad;
    const lower = name.toLowerCase();
    const res = await api(`usernames/${lower}?currentDocument.exists=false`, { method: "PATCH", body: JSON.stringify({ fields: toFields({ uid: uid(), name }) }) });
    if ([400, 403, 409, 412].includes(res.status)) {
      // already there: fine if it is already this scout's own name (a retry), otherwise it's someone else's
      const own = await api(`usernames/${lower}`).catch(() => null);
      if (own && own.ok && fromDoc(await own.json()).uid === uid()) return "";
      return "That name is taken. Try another.";
    }
    if (!res.ok) return "Couldn't save the name. Try again.";
    return "";
  }

  /** Send this scout's numbers (needs a username). */
  async function push(username, stats) {
    const body = { fields: toFields({ username, ...stats, updatedAt: Date.now() }) };
    const res = await api(`scouts/${uid()}`, { method: "PATCH", body: JSON.stringify(body) });
    if (!res.ok) throw new Error("Couldn't send your numbers to the Hall of Scouts.");
  }

  /** Everyone on the team. */
  async function list() {
    const out = [];
    let token = "";
    for (let i = 0; i < 5; i++) {
      const res = await api(`scouts?pageSize=300${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
      if (!res.ok) throw new Error("Couldn't load the Hall of Scouts.");
      const j = await res.json();
      for (const d of j.documents || []) out.push({ ...fromDoc(d), id: String(d.name || "").split("/").pop() });
      token = j.nextPageToken || "";
      if (!token) break;
    }
    return out;
  }

  (root.TN = root.TN || {}).board = { SEASON, TABS, ready, computeStats, rank, signIn, signedIn, signOut, uid, me, claim, push, list, nameProblem };
})(typeof self !== "undefined" ? self : globalThis);
