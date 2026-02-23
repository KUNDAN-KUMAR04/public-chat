/**
 * 💾 CACHE — IndexedDB local message cache
 * 
 * Exactly what WhatsApp Web & Telegram Web do:
 *  - On open: load messages from IndexedDB instantly (zero network wait)
 *  - On receive: write new messages to IndexedDB
 *  - On wipe: clear IndexedDB
 * 
 * Uses the native IndexedDB API directly — no extra libraries needed.
 */

const DB_NAME    = 'um_global_cache';
const DB_VERSION = 1;
const STORE      = 'messages';
const MAX_CACHED = 200; // keep latest 200 messages locally

let db = null;

// ── Open DB ───────────────────────────────────────────────────────────────────
function openDB() {
    return new Promise((resolve, reject) => {
        if (db) return resolve(db);

        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const idb = e.target.result;
            if (!idb.objectStoreNames.contains(STORE)) {
                // keyed by Firestore doc ID, indexed by createdAt for ordered reads
                const store = idb.createObjectStore(STORE, { keyPath: 'id' });
                store.createIndex('createdAt', 'createdAt', { unique: false });
            }
        };

        req.onsuccess = (e) => { db = e.target.result; resolve(db); };
        req.onerror   = (e) => reject(e.target.error);
    });
}

// ── Save one message to IndexedDB ─────────────────────────────────────────────
export async function cacheMessage(id, data) {
    try {
        const idb = await openDB();
        const tx  = idb.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ id, ...data });
        // Fire-and-forget — don't await, non-blocking
    } catch (e) {
        // Cache is non-critical — silently ignore errors
    }
}

// ── Load all cached messages (sorted by createdAt) ────────────────────────────
export function loadCached() {
    return new Promise(async (resolve) => {
        try {
            const idb   = await openDB();
            const tx    = idb.transaction(STORE, 'readonly');
            const index = tx.objectStore(STORE).index('createdAt');
            const req   = index.getAll();
            req.onsuccess = (e) => resolve(e.target.result || []);
            req.onerror   = () => resolve([]);
        } catch {
            resolve([]);
        }
    });
}

// ── Remove one message from cache (for soft-deletes / wipe) ──────────────────
export async function removeCached(id) {
    try {
        const idb = await openDB();
        const tx  = idb.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
    } catch {}
}

// ── Clear entire cache (called on wipe) ───────────────────────────────────────
export async function clearCache() {
    try {
        const idb = await openDB();
        const tx  = idb.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        console.log('🗑 Cache cleared');
    } catch {}
}

// ── Trim cache to MAX_CACHED newest entries ───────────────────────────────────
export async function trimCache() {
    try {
        const all = await loadCached();
        if (all.length <= MAX_CACHED) return;
        // Sort oldest first, delete the overflow
        all.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
        const toDelete = all.slice(0, all.length - MAX_CACHED);
        const idb = await openDB();
        const tx  = idb.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        toDelete.forEach(msg => store.delete(msg.id));
    } catch {}
}

console.log('✅ Cache (IndexedDB) module loaded');
