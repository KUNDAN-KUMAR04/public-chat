/**
 * ⚙️ CORE — Firebase init, boot system, global state
 */

import { firebaseConfig } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';

// Guard against double-init
if (!window.__umInitialized) {
    const app = initializeApp(firebaseConfig);
    window.db  = getFirestore(app);
    window.st  = getStorage(app);
    window.__umInitialized = true;
}

// ── Global state ──────────────────────────────────────────────────────────────
window.engineMode = 'MAX';

export const FEATURES = {
    MAX:   { text:true, images:true, videos:true, audio:true, files:true, replies:true, pin:true, emojis:true, reactions:true, edit:true, msgLimit:100 },
    SMART: { text:true, images:true, videos:true, audio:true, files:false, replies:true, pin:true, emojis:true, reactions:true, edit:true, msgLimit:50  },
    LITE:  { text:true, images:true, videos:false, audio:false, files:false, replies:true, pin:false, emojis:true, reactions:false, edit:false, msgLimit:20  }
};

// ── Boot ─────────────────────────────────────────────────────────────────────
window.boot = (mode) => {
    window.engineMode = mode;
    const gate = document.getElementById('gate');
    if (gate) gate.style.transform = 'translateY(-100%)';
    updateLevelButton(mode);
    window.dispatchEvent(new CustomEvent('engine-booted', { detail: { mode } }));
    console.log(`🚀 Booted: ${mode}`);
};

window.switchLevel = () => {
    const gate = document.getElementById('gate');
    if (gate) gate.style.transform = 'translateY(0)';
    const chat = document.getElementById('chat');
    if (chat) chat.innerHTML = '';
};

function updateLevelButton(mode) {
    const btn = document.getElementById('level-btn');
    if (!btn) return;
    const icons = { MAX:'💎', SMART:'📱', LITE:'⚡' };
    btn.textContent = `${icons[mode]} ${mode}`;
    btn.onclick = window.switchLevel;
}

console.log('✅ Core loaded');
