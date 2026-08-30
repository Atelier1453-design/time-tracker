/* ── 保存（IndexedDB 優先、だめなら localStorage）───────────────
   iPhone のホーム画面アプリで確実に保存を残すための層。
   保存が効いているかどうかを常に呼び出し側へ返す。 */

const DB_NAME = "timetrack-db";
const STORE = "kv";

function openDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) { reject(new Error("no-indexeddb")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("open-failed"));
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("get-failed"));
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("set-failed"));
  });
}

let backend = null; // "indexeddb" | "localstorage" のどちらが実際に使えているか

/* 保存が本当に効いているか、書いて読み直して確かめる */
export async function checkStorage() {
  const stamp = String(Date.now());
  try {
    await idbSet("__probe__", stamp);
    const back = await idbGet("__probe__");
    if (back === stamp) { backend = "indexeddb"; return true; }
  } catch (e) { /* fall through */ }
  try {
    localStorage.setItem("timetrack-probe", stamp);
    const back = localStorage.getItem("timetrack-probe");
    if (back === stamp) { backend = "localstorage"; return true; }
  } catch (e) { /* fall through */ }
  backend = null;
  return false;
}

export function storageBackend() { return backend; }

export async function saveData(key, value) {
  const text = JSON.stringify(value);
  if (backend === "indexeddb") {
    await idbSet(key, text);
    try { localStorage.setItem(key, text); } catch (e) { /* 補助なので失敗しても無視 */ }
    return;
  }
  if (backend === "localstorage") {
    localStorage.setItem(key, text);
    return;
  }
  throw new Error("no-storage-backend");
}

export async function loadData(key) {
  if (backend === "indexeddb") {
    const v = await idbGet(key);
    if (v != null) return JSON.parse(v);
    const ls = localStorage.getItem(key);
    return ls != null ? JSON.parse(ls) : null;
  }
  if (backend === "localstorage") {
    const v = localStorage.getItem(key);
    return v != null ? JSON.parse(v) : null;
  }
  return null;
}
