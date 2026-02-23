/**
 * 👥 ACTIVE USERS — Real-time online count via Firestore presence
 * (Fixes the fake localStorage-only count — now works across tabs/devices)
 */

import {
    doc, setDoc, deleteDoc, onSnapshot, collection, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const SESSION_ID = 'session_' + Math.random().toString(36).slice(2, 11) + '_' + Date.now();
const STALE_MS   = 90_000; // 90 seconds — mark stale

let heartbeatInterval = null;
let unsubPresence     = null;

window.addEventListener('engine-booted', () => {
    initPresence();
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function initPresence() {
    const user  = document.getElementById('u-in')?.value || 'Guest';
    const ref   = doc(window.db, 'presence', SESSION_ID);

    const payload = () => ({
        user,
        ts:    Date.now(),
        mode:  window.engineMode
    });

    // Write on load
    await setDoc(ref, payload()).catch(() => {});

    // Heartbeat every 30s
    heartbeatInterval = setInterval(async () => {
        const currentUser = document.getElementById('u-in')?.value || 'Guest';
        await setDoc(ref, { ...payload(), user: currentUser }).catch(() => {});
    }, 30_000);

    // Subscribe to all presence docs
    unsubPresence = onSnapshot(collection(window.db, 'presence'), (snap) => {
        const now   = Date.now();
        const alive = snap.docs.filter(d => {
            const ts = d.data()?.ts;
            return ts && (now - ts) < STALE_MS;
        });
        updateWidget(alive.length);
    });

    // Clean up on page leave
    window.addEventListener('beforeunload', async () => {
        clearInterval(heartbeatInterval);
        if (unsubPresence) unsubPresence();
        await deleteDoc(ref).catch(() => {});
    });

    // Visibility-based heartbeat pause
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            setDoc(ref, payload()).catch(() => {});
        }
    });
}

// ── Widget ────────────────────────────────────────────────────────────────────
function updateWidget(count) {
    let widget = document.getElementById('active-users-widget');
    if (!widget) {
        widget = document.createElement('div');
        widget.id = 'active-users-widget';
        widget.className = 'active-users-widget';
        document.body.appendChild(widget);
    }

    const tier = count <= 5 ? { label:'BASIC', cls:'tier-basic' }
               : count <= 20 ? { label:'MEDIUM', cls:'tier-medium' }
               : count <= 100 ? { label:'MAX', cls:'tier-max' }
               : { label:'ULTRA', cls:'tier-ultra' };

    widget.className = `active-users-widget ${tier.cls}`;
    widget.title     = `${tier.label} — ${count} online`;
    widget.innerHTML = `
        <span class="presence-dot"></span>
        <span class="presence-count">${count}</span>
        <span class="presence-label">online</span>
    `;
}

console.log('✅ Active users module loaded (Firestore-based)');
