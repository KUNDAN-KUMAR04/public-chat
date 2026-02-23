/**
 * 🗑️ WIPE SYSTEM — Delete all messages, track wipe count
 * Fixed: removed broken dynamic import inside method
 */

import {
    collection, getDocs, deleteDoc, setDoc, doc,
    onSnapshot, query, getDoc, updateDoc, increment
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ── Boot listener ─────────────────────────────────────────────────────────────
window.addEventListener('engine-booted', () => {
    subscribeWipeCounter();
});

// ── Subscribe to wipe counter ─────────────────────────────────────────────────
function subscribeWipeCounter() {
    const statsRef = doc(window.db, 'stats', 'global');
    onSnapshot(statsRef, (snap) => {
        const count = snap.exists() ? (snap.data().wipes || 0) : 0;
        const el = document.getElementById('w-val');
        if (el) el.textContent = count;
    });
}

// ── Wipe all data ─────────────────────────────────────────────────────────────
window.wipeAllData = async () => {
    if (!confirm('⚠️ Delete ALL messages? This cannot be undone!')) return;
    if (!confirm('🚨 Final confirm: ALL messages gone for everyone!')) return;

    const wipeBtn = document.querySelector('.wipe-btn');
    if (wipeBtn) { wipeBtn.disabled = true; wipeBtn.textContent = '⏳ Wiping…'; }

    try {
        // Delete messages in batches
        const snap = await getDocs(collection(window.db, 'messages'));
        const chunks = chunkArray(snap.docs, 20);
        for (const chunk of chunks) {
            await Promise.all(chunk.map(d => deleteDoc(d.ref)));
        }

        // Delete pins too
        const pinsSnap = await getDocs(collection(window.db, 'pins'));
        await Promise.all(pinsSnap.docs.map(d => deleteDoc(d.ref)));

        // Increment wipe counter
        const statsRef = doc(window.db, 'stats', 'global');
        const statsSnap = await getDoc(statsRef);
        if (statsSnap.exists()) {
            await updateDoc(statsRef, { wipes: increment(1) });
        } else {
            await setDoc(statsRef, { wipes: 1 });
        }

        window.showToast?.('✅ Chat wiped');
    } catch (err) {
        console.error('Wipe error:', err);
        alert('❌ Wipe failed. Check console.');
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
