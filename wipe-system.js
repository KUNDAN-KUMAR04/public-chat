/**
 * 🗑️ WIPE SYSTEM — Soft-wipe messages, track wipe count
 * 
 * Rules compatibility:
 *   - /messages: allow update (used for soft-delete {deleted:true})
 *   - /messages: allow delete → FALSE — so we NEVER call deleteDoc on messages
 *   - /admin/stats: allow read only — wipe counter increment done by Admin Dashboard
 *     We just READ the counter here; the admin side handles incrementing it.
 *   - /pinned: allow read only — we can only read pins, not delete them here
 *     Wipe hides pins via updateDoc {hidden:true}
 */

import {
    collection, getDocs, updateDoc, doc,
    onSnapshot, query, where, limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── Boot listener ─────────────────────────────────────────────────────────────
window.addEventListener('engine-booted', () => {
    subscribeWipeCounter();
});

// ── Subscribe to wipe counter — reads admin/stats ─────────────────────────────
// Path: /admin/stats  (single document, read-only from client)
function subscribeWipeCounter() {
    const statsRef = doc(window.db, 'admin', 'stats');
    onSnapshot(statsRef, (snap) => {
        const count = snap.exists() ? (snap.data().wipes ?? snap.data().count ?? 0) : 0;
        const el = document.getElementById('w-val');
        if (el) el.textContent = count;
    }, (err) => {
        // Silently ignore — read may fail if doc doesn't exist yet
        console.log('Stats not yet available');
    });
}

// ── Wipe — soft-delete all messages via updateDoc ─────────────────────────────
// NOTE: delete is blocked by rules. We mark deleted:true on every message.
// The counter is managed by your Admin Dashboard — we don't increment it here.
window.wipeAllData = async () => {
    if (!confirm('⚠️ Soft-delete ALL messages? They will be hidden for everyone.')) return;
    if (!confirm('🚨 Final confirm: this hides all messages for all users!')) return;

    const wipeBtn = document.querySelector('.wipe-btn');
    if (wipeBtn) { wipeBtn.disabled = true; wipeBtn.textContent = '⏳ Wiping…'; }

    try {
        // Soft-delete all messages in batches of 20
        const snap = await getDocs(collection(window.db, 'messages'));
        const chunks = chunkArray(snap.docs, 20);
        for (const chunk of chunks) {
            await Promise.all(chunk.map(d =>
                updateDoc(d.ref, { deleted: true, text: '', fileURL: null })
            ));
        }

        // Hide all pins in /pinned via updateDoc (delete not allowed)
        const pinsSnap = await getDocs(collection(window.db, 'pinned'));
        await Promise.all(pinsSnap.docs.map(d =>
            updateDoc(d.ref, { hidden: true }).catch(() => {})
        ));

        // Note: wipe counter increment is handled by your Admin Dashboard.
        // Client rules are read-only on /admin/stats.

        window.showToast?.('✅ Chat wiped');
    } catch (err) {
        console.error('Wipe error:', err);
        alert('❌ Wipe failed. Check console for details.');
    } finally {
        if (wipeBtn) { wipeBtn.disabled = false; wipeBtn.textContent = '🗑️ WIPE CHAT'; }
    }
};

function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
}

console.log('✅ Wipe system module loaded');
