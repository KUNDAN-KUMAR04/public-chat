/**
 * 📌 SPECIAL BOX — Sidebar with pinned messages, outside-click-to-close
 * Collection: "pinned" (matches Firestore rules)
 * Unpin: updateDoc {hidden:true} — delete is not permitted by Firestore rules
 */

import {
    collection, addDoc, updateDoc, onSnapshot, serverTimestamp,
    doc, query, orderBy, where
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let unsubPins = null;

window.addEventListener('engine-booted', () => {
    setupSidebar();
    subscribeTopins();
});

// ── Sidebar open/close ────────────────────────────────────────────────────────
window.toggleSidebar = () => {
    const side = document.getElementById('side');
    if (!side) return;
    const isOpen = side.classList.toggle('open');
    if (isOpen) {
        requestAnimationFrame(() => {
            const handler = (e) => {
                if (!side.contains(e.target) && !document.getElementById('sidebar-toggle')?.contains(e.target)) {
                    closeSidebar();
                    document.removeEventListener('click', handler);
                }
            };
            document.addEventListener('click', handler);
        });
    }
};

function closeSidebar() {
    document.getElementById('side')?.classList.remove('open');
}

window.hideSidebar = closeSidebar;

// ── Sidebar init ──────────────────────────────────────────────────────────────
function setupSidebar() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSidebar();
    });
}

// ── Pin a message ─────────────────────────────────────────────────────────────
window.pinMessage = async (msgId) => {
    const el   = document.querySelector(`[data-msg-id="${msgId}"]`);
    const text = el?.querySelector('.msg-text')?.textContent || '📎 File';
    const user = el?.dataset.user || 'Guest';

    try {
        // Collection is "pinned" per Firestore rules
        await addDoc(collection(window.db, 'pinned'), {
            msgId,
            text,
            user,
            hidden:   false,
            pinnedAt: serverTimestamp()
        });
        showToast('📌 Message pinned');
    } catch (err) {
        console.error('Pin error:', err);
        showToast('❌ Could not pin message');
    }
};

// Firestore rules block delete on /pinned — mark hidden via update instead
window.unpinMessage = async (pinDocId) => {
    try {
        await updateDoc(doc(window.db, 'pinned', pinDocId), { hidden: true });
    } catch (err) {
        console.error('Unpin error:', err);
    }
};

// ── Subscribe to pins ─────────────────────────────────────────────────────────
function subscribeTopins() {
    if (unsubPins) unsubPins();

    // Filter out hidden pins, newest first
    const q = query(
        collection(window.db, 'pinned'),
        where('hidden', '==', false),
        orderBy('pinnedAt', 'desc')
    );
    unsubPins = onSnapshot(q, (snap) => {
        renderPinList(snap.docs);
    });
}

function renderPinList(docs) {
    const pinList = document.getElementById('pin-list');
    if (!pinList) return;

    if (docs.length === 0) {
        pinList.innerHTML = '<p class="pin-empty">No pinned messages yet.<br>Pin a message using the 📌 button.</p>';
        return;
    }

    pinList.innerHTML = '';
    docs.forEach(d => {
        const data = d.data();
        const item = document.createElement('div');
        item.className = 'pin-item';
        item.innerHTML = `
            <div class="pin-content">
                <span class="pin-user">${escHtml(data.user)}</span>
                <span class="pin-text">${escHtml(truncate(data.text, 80))}</span>
            </div>
            <button class="pin-remove" onclick="window.unpinMessage('${d.id}')" title="Unpin">✕</button>
        `;
        item.querySelector('.pin-content').onclick = () => {
            closeSidebar();
            const msgEl = document.querySelector(`[data-msg-id="${data.msgId}"]`);
            if (msgEl) {
                msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                msgEl.querySelector('.msg-bubble')?.classList.add('flash');
                setTimeout(() => msgEl.querySelector('.msg-bubble')?.classList.remove('flash'), 1500);
            }
        };
        pinList.appendChild(item);
    });
}

// ── Toast helper ──────────────────────────────────────────────────────────────
function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('toast-show');
    setTimeout(() => toast.classList.remove('toast-show'), 2500);
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + '…' : s;
}

window.showToast = showToast;

console.log('✅ Special box module loaded');
