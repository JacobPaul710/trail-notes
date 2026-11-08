"use strict";
// Everything is saved on the device (IndexedDB), so the app works with no signal.
(function (root) {
  const NAME = "trail-notes";
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, 2); // v2: cards live inside areas
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "number" });
        if (!db.objectStoreNames.contains("areacards")) {
          const a = db.createObjectStore("areacards", { keyPath: "key" }); // key = "<area id>:<trail number>"
          a.createIndex("area", "area");
        }
        if (!db.objectStoreNames.contains("recordings")) {
          const r = db.createObjectStore("recordings", { keyPath: "id", autoIncrement: true });
          r.createIndex("card", "card");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function run(store, mode, fn) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(store, mode);
          const s = tx.objectStore(store);
          let result;
          Promise.resolve(fn(s)).then((r) => (result = r));
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error("Saving was cancelled."));
        })
    );
  }
  const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

  const db = {
    get: (store, key) => run(store, "readonly", (s) => req(s.get(key))),
    all: (store) => run(store, "readonly", (s) => req(s.getAll())),
    put: (store, value, key) => run(store, "readwrite", (s) => req(key === undefined ? s.put(value) : s.put(value, key))),
    del: (store, key) => run(store, "readwrite", (s) => req(s.delete(key))),
    clear: (store) => run(store, "readwrite", (s) => req(s.clear())),
    byCard: (area, number) =>
      run("recordings", "readonly", (s) => req(s.index("card").getAll(number))).then((list) => list.filter((r) => (r.area || "") === area)),
    cardsIn: (area) => run("areacards", "readonly", (s) => req(s.index("area").getAll(area))),
  };

  (root.TN = root.TN || {}).db = db;
})(self);
