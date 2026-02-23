/**
 * ⚙️ CORE FEATURE
 * Gate selection and boot system
 * - Level selection (MAX, SMART, LITE)
 * - Boot app with selected level
 * - Initialize Firebase
 */

import { firebaseConfig } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, orderBy, limit, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const st = getStorage(app);

// Global state
window.engineMode = 'MAX';
window.db = db;
window.st = st;

// BOOT SYSTEM - Gate selection
window.boot = (mode) => {
    window.engineMode = mode;
    console.log(`✅ Engine booted: ${mode} mode`);
    
    const gate = document.getElementById('gate');
    if (gate) {
        gate.style.transform = 'translateY(-100%)';
    }
    
    // Emit event that all features can listen to
    window.dispatchEvent(new CustomEvent('engine-booted', { detail: { mode } }));
};

// Log when core loads
console.log('✅ Core module loaded - awaiting boot...');
