/**
 * ⌨️ TYPING INDICATOR — "X is typing…"
 */

import {
    doc, setDoc, deleteDoc, onSnapshot, collection
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { currentUser } from './messages.js';

let typingTimeout = null;
let isTyping = false;
let unsubTyping = null;

// ── Listen for boot ───────────────────────────────────────────────────────────
window.addEventListener('engine-booted', () => {
    startTypingListener();
});

// ── Start typing ──────────────────────────────────────────────────────────────
window.addEventListener('typing-start', () => {
    if (!isTyping) {
        isTyping = true;
        setTypingStatus(true);
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        isTyping = false;
        setTypingStatus(false);
    }, 3000);
});

window.addEventListener('typing-stop', () => {
    clearTimeout(typingTimeout);
    isTyping = false;
    setTypingStatus(false);
});

async function setTypingStatus(isTyping) {
    const user = currentUser();
    if (!user || user === 'Guest') return;
    const ref = doc(window.db, 'typing', user);
    try {
        if (isTyping) {
            await setDoc(ref, { user, ts: Date.now() });
        } else {
            await deleteDoc(ref);
        }
    } catch (e) {
        // Silently ignore — typing is non-critical
    }
}

// ── Listen for others typing ──────────────────────────────────────────────────
function startTypingListener() {
    if (unsubTyping) unsubTyping();

    unsubTyping = onSnapshot(collection(window.db, 'typing'), (snap) => {
        const myUser = currentUser();
        const typers = [];
        const now = Date.now();

        snap.forEach(d => {
            const data = d.data();
            if (data.user !== myUser && (now - data.ts) < 5000) {
                typers.push(data.user);
            }
        });

        updateTypingUI(typers);
    });
}

function updateTypingUI(typers) {
    let el = document.getElementById('typing-indicator');
    if (!el) {
        el = document.createElement('div');
        el.id = 'typing-indicator';
        el.className = 'typing-indicator';
        const chat = document.getElementById('chat');
        if (chat) chat.after(el);
    }

    if (typers.length === 0) {
        el.style.display = 'none';
        return;
    }

    el.style.display = 'flex';
    const names = typers.slice(0, 3).join(', ');
    const suffix = typers.length === 1 ? 'is typing' : 'are typing';
    el.innerHTML = `
        <span class="typing-dots">
            <span></span><span></span><span></span>
        </span>
        <span class="typing-text">${names} ${suffix}…</span>
    `;
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    setTypingStatus(false);
});

console.log('✅ Typing indicator module loaded');
