/**
 * ⌨️ TYPING INDICATOR — "X is typing…"
 *
 * Since /typing is not in Firestore rules, we use:
 *   BroadcastChannel for cross-tab (same device/browser)
 *   Falls back to localStorage + storage events
 *
 * For cross-device typing indicators, add /typing to your Firestore rules.
 */

import { currentUser } from './messages.js';

const LS_KEY    = 'um_typing';
const EXPIRE_MS = 4000; // clear after 4s of no keystrokes

let typingTimeout = null;
let isTyping      = false;
let bc            = null;

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('engine-booted', () => {
    if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('um_typing_channel');
        bc.onmessage = (e) => {
            if (e.data?.type === 'typing') {
                showTyping(e.data.user);
            } else if (e.data?.type === 'stop') {
                clearTyping(e.data.user);
            }
        };
    }

    // Listen for storage events from other same-device tabs
    window.addEventListener('storage', (e) => {
        if (e.key === LS_KEY) renderTypingFromLS();
    });

    ensureTypingEl();
});

// ── Start/stop events from messages.js ───────────────────────────────────────
window.addEventListener('typing-start', () => {
    const user = currentUser();
    if (!user || user === 'Guest') return;

    if (!isTyping) {
        isTyping = true;
        broadcastTyping(user, true);
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        broadcastTyping(user, false);
    }, EXPIRE_MS);
});

window.addEventListener('typing-stop', () => {
    const user = currentUser();
    clearTimeout(typingTimeout);
    isTyping = false;
    broadcastTyping(user, false);
});

window.addEventListener('beforeunload', () => {
    broadcastTyping(currentUser(), false);
    bc?.close();
});

// ── Broadcast helpers ─────────────────────────────────────────────────────────
function broadcastTyping(user, typing) {
    if (typing) {
        bc?.postMessage({ type: 'typing', user });
        writeLS(user, true);
    } else {
        bc?.postMessage({ type: 'stop', user });
        writeLS(user, false);
    }
}

function writeLS(user, typing) {
    try {
        const state = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
        if (typing) {
            state[user] = Date.now();
        } else {
            delete state[user];
        }
        localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {}
}

function renderTypingFromLS() {
    try {
        const state = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
        const now   = Date.now();
        const typers = Object.entries(state)
            .filter(([u, ts]) => u !== currentUser() && (now - ts) < EXPIRE_MS)
            .map(([u]) => u);
        updateTypingUI(typers);
    } catch {}
}

// ── Show/clear from BroadcastChannel ─────────────────────────────────────────
const activeTypers = new Map(); // user → timeout id

function showTyping(user) {
    if (user === currentUser()) return;
    // Clear existing timeout for this user
    clearTimeout(activeTypers.get(user));
    activeTypers.set(user, setTimeout(() => {
        activeTypers.delete(user);
        updateTypingUI([...activeTypers.keys()]);
    }, EXPIRE_MS + 500));
    updateTypingUI([...activeTypers.keys()]);
}

function clearTyping(user) {
    clearTimeout(activeTypers.get(user));
    activeTypers.delete(user);
    updateTypingUI([...activeTypers.keys()]);
}

// ── UI ────────────────────────────────────────────────────────────────────────
function ensureTypingEl() {
    if (document.getElementById('typing-indicator')) return;
    const el = document.createElement('div');
    el.id        = 'typing-indicator';
    el.className = 'typing-indicator';
    el.style.display = 'none';
    const chat = document.getElementById('chat');
    if (chat) chat.after(el);
}

function updateTypingUI(typers) {
    const el = document.getElementById('typing-indicator');
    if (!el) return;

    if (!typers.length) {
        el.style.display = 'none';
        return;
    }

    el.style.display = 'flex';
    const names  = typers.slice(0, 3).join(', ');
    const suffix = typers.length === 1 ? 'is typing' : 'are typing';
    el.innerHTML = `
        <span class="typing-dots"><span></span><span></span><span></span></span>
        <span class="typing-text">${names} ${suffix}…</span>
    `;
}

console.log('✅ Typing indicator module loaded (BroadcastChannel/localStorage)');
