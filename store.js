// Die Schatten von Eldermoor – Speicherung in IndexedDB (mit Arbeitsspeicher-Rückfall)
// Autor: eldermoor-dev

const DB_NAME = 'eldermoor-dev';
const STORE = 'kv';

const memory = new Map();
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('IndexedDB nicht verfügbar')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const store = {
  persistent: true, // wird false, sobald IndexedDB ausfällt (dann gehen Daten beim Schließen verloren)
  async get(key) {
    try { const db = await openDb(); return await tx(db, 'readonly', (s) => s.get(key)); }
    catch { this.persistent = false; return memory.get(key); }
  },
  async set(key, value) {
    try { const db = await openDb(); await tx(db, 'readwrite', (s) => s.put(value, key)); }
    catch { this.persistent = false; memory.set(key, value); }
  },
  async del(key) {
    try { const db = await openDb(); await tx(db, 'readwrite', (s) => s.delete(key)); }
    catch { this.persistent = false; memory.delete(key); }
  }
};
