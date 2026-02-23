/**
 * 😊 REACTIONS — Emoji reactions on messages
 */

import {
    doc, updateDoc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { currentUser } from './messages.js';

const REACTION_EMOJIS = ['👍','❤️','😂','😮','😢','😡','🔥','👏','🎉','💯'];

let pickerEl = null;

// ── Show picker ───────────────────────────────────────────────────────────────
window.showReactionPicker = (msgId, triggerBtn) => {
    // Remove existing picker
    pickerEl?.remove();

    pickerEl = document.createElement('div');
    pickerEl.className = 'reaction-picker';
    pickerEl.setAttribute('role', 'dialog');
    pickerEl.setAttribute('aria-label', 'Choose a reaction');

    REACTION_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.className = 'reaction-option';
        btn.textContent = emoji;
        btn.title = emoji;
        btn.onclick = (e) => {
            e.stopPropagation();
            window.toggleReaction(msgId, emoji);
            pickerEl?.remove();
            pickerEl = null;
        };
        pickerEl.appendChild(btn);
    });

    // Position near trigger button
    const rect = triggerBtn.getBoundingClientRect();
    pickerEl.style.position = 'fixed';
    pickerEl.style.bottom   = `${window.innerHeight - rect.top + 8}px`;
    pickerEl.style.left     = `${Math.min(rect.left, window.innerWidth - 260)}px`;
    document.body.appendChild(pickerEl);

    // Close on outside click
    const close = (e) => {
        if (!pickerEl?.contains(e.target)) {
            pickerEl?.remove();
            pickerEl = null;
            document.removeEventListener('click', close);
        }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
};

// ── Toggle reaction ───────────────────────────────────────────────────────────
window.toggleReaction = async (msgId, emoji) => {
    const user = currentUser();
    const msgRef = doc(window.db, 'messages', msgId);

    try {
        const snap = await getDoc(msgRef);
        if (!snap.exists()) return;

        const reactions = { ...(snap.data().reactions || {}) };
        const currentEmoji = reactions[user];

        if (currentEmoji === emoji) {
            delete reactions[user]; // un-react
        } else {
            reactions[user] = emoji; // react / change
        }

        await updateDoc(msgRef, { reactions });
    } catch (err) {
        console.error('Reaction error:', err);
    }
};

console.log('✅ Reactions module loaded');
