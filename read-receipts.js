/**
 * 👁️ READ RECEIPTS — Seen status on messages
 */

import {
    doc, updateDoc, onSnapshot, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { currentUser } from './messages.js';

let observer = null;

window.addEventListener('engine-booted', () => {
    setupReadObserver();
});

// ── Intersection observer to mark messages as seen ────────────────────────────
function setupReadObserver() {
    if (observer) observer.disconnect();

    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const wrapper = entry.target.closest('[data-msg-id]');
            if (!wrapper) return;
            const msgId = wrapper.dataset.msgId;
            const msgUser = wrapper.dataset.user;
            const myUser = currentUser();
            if (!msgId || msgUser === myUser) return; // don't mark own messages
            markSeen(msgId, myUser);
        });
    }, { threshold: 0.7 });

    // Observe existing and future messages via MutationObserver
    const chat = document.getElementById('chat');
    if (!chat) return;

    const attachObserver = (el) => {
        const bubble = el.querySelector('.msg-bubble');
        if (bubble) observer.observe(bubble);
    };

    chat.querySelectorAll('[data-msg-id]').forEach(attachObserver);

    const mutObs = new MutationObserver(mutations => {
        mutations.forEach(m => m.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
                if (node.dataset?.msgId) attachObserver(node);
                node.querySelectorAll?.('[data-msg-id]').forEach(attachObserver);
            }
        }));
    });
    mutObs.observe(chat, { childList: true, subtree: true });
}

async function markSeen(msgId, user) {
    if (!user || user === 'Guest') return;
    try {
        await updateDoc(doc(window.db, 'messages', msgId), {
            seenBy: arrayUnion(user)
        });
    } catch { /* non-critical */ }
}

// Called from messages.js when rendering a bubble — attach seen indicator
window.renderSeenIndicator = (container, seenBy = [], isMy) => {
    if (!isMy || !seenBy.length) return;
    const el = document.createElement('div');
    el.className = 'seen-indicator';
    const names = seenBy.slice(0, 3).join(', ');
    const more  = seenBy.length > 3 ? ` +${seenBy.length - 3}` : '';
    el.innerHTML = `👁 Seen by ${names}${more}`;
    container.appendChild(el);
};

console.log('✅ Read receipts module loaded');
