"use strict";
// Sync to Google Drive: sign in once, then each finished trail is saved as a small file in a
// "Trail Notes" folder in YOUR Drive. Trail Engine reads that folder.
//   TN.drive.linked()          signed in before on this device?
//   TN.drive.tokenValid()      good for another few minutes?
//   TN.drive.signIn()          goes to Google and comes back (a redirect works in a home-screen app)
//   TN.drive.handleReturn()    run at startup: picks up the sign-in when Google sends you back
//   TN.drive.upload(files)     files = [{ name, json }]  -> uploads/updates each one
//   TN.drive.signOut()
(function (root) {
  const cfg = () => root.TN.config;
  const KEY = "tn-google";        // { token, exp }
  const LINKED = "tn-google-linked";
  const NONCE = "tn-google-nonce";
  const EMAIL = "tn-google-email";
  const FOLDER_ID = "tn-google-folder";
  const API = "https://www.googleapis.com/drive/v3/files";
  const UP = "https://www.googleapis.com/upload/drive/v3/files";

  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
  const del = (k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } };

  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, "");

  function stored() {
    try { return JSON.parse(get(KEY) || "null"); } catch (e) { return null; }
  }
  const tokenValid = () => { const t = stored(); return !!(t && t.token && t.exp > Date.now() + 120000); };
  const linked = () => get(LINKED) === "1";

  function signIn(pickAccount) {
    const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
    set(NONCE, nonce);
    set("tn-google-pending", "1");
    const q = new URLSearchParams({
      client_id: cfg().CLIENT_ID, redirect_uri: redirectUri(), response_type: "token",
      scope: cfg().SCOPE, state: nonce,
    });
    if (pickAccount) q.set("prompt", "select_account");
    location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  }

  /** Call once at startup. Returns "signed-in", "error:<text>" or "" (nothing to do). */
  function handleReturn() {
    const h = location.hash || "";
    if (!/access_token=|error=/.test(h)) return "";
    const p = new URLSearchParams(h.replace(/^#/, ""));
    history.replaceState(null, "", location.pathname + location.search);
    const nonce = get(NONCE);
    del(NONCE);
    if (p.get("error")) { del("tn-google-pending"); return `error:${p.get("error")}`; }
    if (!nonce || p.get("state") !== nonce) { del("tn-google-pending"); return "error:the sign-in didn't match, try again"; }
    set(KEY, JSON.stringify({ token: p.get("access_token"), scope: p.get("scope") || "", exp: Date.now() + Number(p.get("expires_in") || 3600) * 1000 }));
    set(LINKED, "1");
    return "signed-in";
  }

  function signOut() { del(KEY); del(LINKED); del(FOLDER_ID); del("tn-google-pending"); del(EMAIL); }

  /** Which Google account is signed in (shown so you know). Needs a good token; safe to fail. */
  async function fetchAccount() {
    try {
      const me = await call("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)");
      if (me && me.user && me.user.emailAddress) set(EMAIL, me.user.emailAddress);
    } catch (e) { /* the bar just won't show the address */ }
    return account();
  }
  const account = () => get(EMAIL) || "";
  const folderUrl = () => (get(FOLDER_ID) ? `https://drive.google.com/drive/folders/${get(FOLDER_ID)}` : "");

  async function call(url, opts = {}) {
    const t = stored();
    if (!t || !tokenValid()) throw Object.assign(new Error("Sign in with Google again."), { code: "AUTH" });
    const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${t.token}` } });
    if (res.status === 401) { del(KEY); throw Object.assign(new Error("Sign in with Google again."), { code: "AUTH" }); }
    if (!res.ok) {
      let msg = "";
      try { msg = (await res.json()).error.message; } catch (e) { /* ignore */ }
      throw new Error(`Google Drive said no (${res.status}${msg ? `: ${msg}` : ""})`);
    }
    return res.json();
  }

  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  async function folderId() {
    const cached = get(FOLDER_ID);
    if (cached) {
      try { const f = await call(`${API}/${cached}?fields=id,trashed`); if (!f.trashed) return f.id; } catch (e) { if (e.code === "AUTH") throw e; }
      del(FOLDER_ID);
    }
    const q = `name='${esc(cfg().FOLDER)}' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`;
    const found = await call(`${API}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`);
    let id = found.files && found.files[0] && found.files[0].id;
    if (!id) {
      const made = await call(`${API}?fields=id`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cfg().FOLDER, mimeType: "application/vnd.google-apps.folder" }),
      });
      id = made.id;
    }
    set(FOLDER_ID, id);
    return id;
  }

  async function putFile(folder, name, json) {
    const q = `name='${esc(name)}' and '${folder}' in parents and trashed=false`;
    const found = await call(`${API}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`);
    const existing = found.files && found.files[0] && found.files[0].id;
    const boundary = "tn" + Math.random().toString(36).slice(2);
    const meta = existing ? { name } : { name, parents: [folder], mimeType: "application/json" };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
    await call(`${UP}${existing ? `/${existing}` : ""}?uploadType=multipart&fields=id`, {
      method: existing ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  /** Signed in with permission to edit sheets? (Older sign-ins only had Drive.) */
  const canEditSheets = () => { const t = stored(); return !!(t && /auth\/spreadsheets/.test(t.scope || "")); };

  /**
   * After a trail syncs: set its Status on the Trail List.
   *   status  "Tracked" (finished)
   * Only rows that are blank or still Planned are changed;
   * All data gathered, Submitted, Accepted and the like are left alone.
   * Returns how many rows changed. Throws on failure; callers treat that as non-fatal.
   */
  async function markStatus(sheetId, tab, numbers, status) {
    if (!sheetId || !tab || !numbers.length) return 0;
    const q = `'${String(tab).replace(/'/g, "''")}'`;
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
    const got = await call(`${base}/values/${encodeURIComponent(`${q}!A2:D`)}`);
    const rows = got.values || [];
    const want = new Set(numbers.map((n) => String(Number(n))));
    const from = ["", "planned"];
    const data = [];
    rows.forEach((r, i) => {
      const n = String(r[0] || "").trim();
      const cur = String(r[3] || "").trim().toLowerCase();
      if (n && want.has(String(Number(n))) && from.includes(cur)) {
        data.push({ range: `${q}!D${i + 2}`, values: [[status]] });
      }
    });
    if (!data.length) return 0;
    await call(`${base}/values:batchUpdate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
    });
    return data.length;
  }

  /** files = [{ name, json, done? }]. Calls onEach(index) after each one lands. */
  async function upload(files, onEach) {
    const folder = await folderId();
    for (let i = 0; i < files.length; i++) {
      await putFile(folder, files[i].name, files[i].json);
      onEach && onEach(i);
    }
  }

  (root.TN = root.TN || {}).drive = { linked, tokenValid, signIn, handleReturn, signOut, upload, canEditSheets, markStatus, redirectUri, fetchAccount, account, folderUrl };
})(self);
