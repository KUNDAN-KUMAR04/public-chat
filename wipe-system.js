/**
 * 🗑️ WIPE SYSTEM FEATURE
 * Global wipe all messages, track wipe count
 * EVERYTHING about wiping in ONE file
 */

import { collection, getDocs, deleteDoc, serverTimestamp, setDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class WipeSystemFeature {
    constructor() {
        this.init();
    }

    init() {
        this.setupWipeButton();
        this.setupEngineListener();
    }

    setupWipeButton() {
        const wipeBtn = document.querySelector('[onclick*="wipeAllData"]');
        if (wipeBtn) {
            wipeBtn.addEventListener('click', () => this.wipeAllData());
        }
    }

    setupEngineListener() {
        window.addEventListener('engine-booted', () => {
            this.loadWipeCounter();
        });
    }

    async wipeAllData() {
        if (!confirm("⚠️ WIPE ALL MESSAGES? This cannot be undone!")) {
            return;
        }

        if (!confirm("🚨 Are you SURE? ALL messages will be deleted for everyone!")) {
            return;
        }

        try {
            window.dispatchEvent(new CustomEvent('start-loading', { detail: { text: 'Wiping...' } }));

            // Delete all messages
            const snap = await getDocs(collection(window.db, "messages"));
            await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));

            // Increment wipe counter
            const statsRef = collection(window.db, "stats");
            const statsSnap = await getDocs(statsRef);
            
            if (!statsSnap.empty) {
                const cur = statsSnap.docs[0].data().count || 0;
                await setDoc(statsSnap.docs[0].ref, { count: cur + 1 });
            } else {
                await setDoc(doc(statsRef), { count: 1 });
            }

            window.dispatchEvent(new CustomEvent('stop-loading'));
            alert('✅ Chat wiped successfully');
        } catch (error) {
            console.error('Wipe error:', error);
            window.dispatchEvent(new CustomEvent('stop-loading'));
            alert('❌ Wipe failed');
        }
    }

    loadWipeCounter() {
        // Listen for wipe count updates
        import { onSnapshot, query, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
        
        const q = query(collection(window.db, "stats"));
        onSnapshot(q, (snap) => {
            if (!snap.empty) {
                const count = snap.docs[0].data().count || 0;
                const wValEl = document.getElementById('w-val');
                if (wValEl) {
                    wValEl.innerText = count;
                }
            }
        });
    }
}

// Initialize
window.wipeSystemFeature = new WipeSystemFeature();

// Global function
window.wipeAllData = () => window.wipeSystemFeature.wipeAllData();

console.log('✅ Wipe system module loaded');
