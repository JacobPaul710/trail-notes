"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const store = {};
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
global.location = { origin: "https://x.github.io" };
global.TN = { config: { FIREBASE: { apiKey: "KEY", projectId: "proj" } } };
require("../js/board.js");
const B = global.TN.board;

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const card = (finished, miles, extra = {}) => ({ status: "done", finishedAt: finished, miles, ...extra });

test("numbers: trails, season, miles, longest, best day and month", () => {
  const cards = [
    card(at(2026, 5, 1, 9), 4.5), card(at(2026, 5, 1, 14), 12), card(at(2026, 5, 1, 17), 2),
    card(at(2026, 5, 9), 7), card(at(2026, 6, 2), 3),
    card(at(2025, 12, 30), 20),                       // last season: counts in totals, not 2026
    card(at(2026, 6, 3), 9, { outcome: "partial", status: "abandoned" }),   // not completed: ignored
    { status: "in-progress", miles: 5 },              // not finished: ignored
  ];
  const s = B.computeStats(cards, at(2026, 7, 1));
  assert.equal(s.trails, 6);
  assert.equal(s.season, 5);
  assert.equal(s.miles, 48.5);
  assert.equal(s.longest, 20);
  assert.equal(s.bestDay, 3);
  assert.equal(s.bestMonth, 4);
  assert.equal(s.streak, 0);
});

test("streak counts back from today, or from yesterday if nothing yet today", () => {
  const cards = [card(at(2026, 7, 1), 1), card(at(2026, 6, 30), 1), card(at(2026, 6, 29), 1), card(at(2026, 6, 27), 1)];
  assert.equal(B.computeStats(cards, at(2026, 7, 1, 20)).streak, 3);
  assert.equal(B.computeStats(cards, at(2026, 7, 2, 8)).streak, 3);
  assert.equal(B.computeStats(cards, at(2026, 7, 3, 8)).streak, 0);
});

test("ranking: highest first, ties share a rank, zeros left out", () => {
  const r = B.rank([{ username: "b", season: 5 }, { username: "a", season: 5 }, { username: "c", season: 9 }, { username: "z", season: 0 }], "season");
  assert.deepEqual(r.map((x) => [x.username, x.rank]), [["c", 1], ["a", 2], ["b", 2]]);
});

test("username rules", () => {
  assert.equal(B.nameProblem("Ranger_Jo"), "");
  assert.ok(B.nameProblem("ab"));
  assert.ok(B.nameProblem("has space"));
  assert.ok(B.nameProblem("x".repeat(17)));
});

function fakeFirebase() {
  const calls = [];
  const names = new Map(), scouts = new Map();
  global.fetch = async (url, opts = {}) => {
    calls.push([url, opts.method || "GET"]);
    const json = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (url.includes("accounts:signInWithIdp")) return json(200, { idToken: "ID", refreshToken: "RT", localId: "u1", expiresIn: "3600" });
    if (url.includes("securetoken")) return json(200, { id_token: "ID2", refresh_token: "RT", user_id: "u1", expires_in: "3600" });
    const m = url.match(/documents\/(usernames|scouts)(?:\/([^?]+))?(\?.*)?$/);
    if (!m) return json(404, {});
    if (m[1] === "usernames" && opts.method === "PATCH") {
      if (names.has(m[2])) return json(409, { error: { status: "ALREADY_EXISTS" } });
      names.set(m[2], "u1"); return json(200, {});
    }
    if (m[1] === "usernames" && m[2] && !opts.method) return names.get(m[2]) === "u1" ? json(200, { fields: { uid: { stringValue: "u1" } } }) : names.has(m[2]) ? json(200, { fields: { uid: { stringValue: "other" } } }) : json(404, {});
    if (m[1] === "scouts" && opts.method === "PATCH") { scouts.set(m[2], JSON.parse(opts.body)); return json(200, {}); }
    if (m[1] === "scouts" && m[2]) return scouts.has(m[2]) ? json(200, { fields: scouts.get(m[2]).fields }) : json(404, {});
    return json(200, { documents: [...scouts].map(([id, d]) => ({ name: `projects/p/databases/(default)/documents/scouts/${id}`, fields: d.fields })) });
  };
  return { calls, names, scouts };
}

test("sign in, pick a name, a taken name is refused, numbers are sent and listed", async () => {
  const f = fakeFirebase();
  assert.equal(B.signedIn(), false);
  await B.signIn("google-token");
  assert.equal(B.signedIn(), true);
  assert.equal(B.uid(), "u1");
  assert.equal(await B.me(), null);
  f.names.set("taken", 1);
  assert.match(await B.claim("Taken"), /taken/);
  assert.equal(await B.claim("RangerJo"), "");
  assert.equal(await B.claim("RangerJo"), "");   // a retry of your own name is fine
  assert.ok(f.names.has("rangerjo"));
  await B.push("RangerJo", { trails: 6, season: 5, miles: 48.5, longest: 20, bestDay: 3, bestMonth: 4, streak: 2 });
  const mine = await B.me();
  assert.equal(mine.username, "RangerJo");
  assert.equal(mine.miles, 48.5);
  assert.equal(mine.season, 5);
  const all = await B.list();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, "u1");
});

test("an expired Firebase token is refreshed; a refused refresh means sign in again", async () => {
  const f = fakeFirebase();
  await B.signIn("g");
  const a = JSON.parse(store["tn-board-auth"]); a.exp = Date.now() - 1000; store["tn-board-auth"] = JSON.stringify(a);
  await B.me();
  assert.ok(f.calls.some(([u]) => u.includes("securetoken")));
  const b = JSON.parse(store["tn-board-auth"]); b.exp = Date.now() - 1000; store["tn-board-auth"] = JSON.stringify(b);
  global.fetch = async () => ({ ok: false, status: 400, json: async () => ({}) });
  await assert.rejects(B.me(), (e) => e.code === "AUTH");
  assert.equal(B.signedIn(), false);
});
