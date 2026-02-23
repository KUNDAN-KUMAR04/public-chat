/**
 * 📌 SPECIAL BOX FEATURE
 * Sidebar, pinning messages, managing pinned items
 * EVERYTHING about special box in ONE file
 */

class SpecialBoxFeature {
    constructor() {
        this.pinnedMessages = [];
        this.init();
    }

    init() {
        this.setupSidebarHandlers();
        this.setupEngineListener();
    }

    setupSidebarHandlers() {
        const toggleBtn = document.querySelector('[onclick*="toggleSidebar"]');
        const closeBtn = document.querySelector('[onclick*="hideSidebar"]');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => this.toggleSidebar());
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideSidebar());
        }
    }

    setupEngineListener() {
        window.addEventListener('engine-booted', () => {
            this.loadPinnedMessages();
        });
    }

    toggleSidebar() {
        const side = document.getElementById('side');
        if (side) {
            side.classList.toggle('open');
        }
    }

    hideSidebar() {
        const side = document.getElementById('side');
        if (side) {
            side.classList.remove('open');
        }
    }

    loadPinnedMessages() {
        const pinList = document.getElementById('pin-list');
        if (!pinList) return;

        // For now, show empty state
        pinList.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">No pinned messages yet</p>';
    }

    pinMessage(msgId, msgText) {
        console.log(`📌 Pinned: ${msgText}`);
        // Can be extended with Firebase storage for pinned messages
    }

    unpinMessage(msgId) {
        console.log(`❌ Unpinned: ${msgId}`);
    }

    clearAllPins() {
        if (confirm('Clear all pinned messages?')) {
            const pinList = document.getElementById('pin-list');
            if (pinList) {
                pinList.innerHTML = '<p style="color:#999; text-align:center; padding:20px;">No pinned messages yet</p>';
            }
            console.log('✅ All pins cleared');
        }
    }
}

// Initialize
window.specialBoxFeature = new SpecialBoxFeature();

// Global access functions
window.toggleSidebar = () => window.specialBoxFeature.toggleSidebar();
window.hideSidebar = () => window.specialBoxFeature.hideSidebar();
window.pinMessage = (id, text) => window.specialBoxFeature.pinMessage(id, text);
window.clearAllPins = () => window.specialBoxFeature.clearAllPins();

console.log('✅ Special box module loaded');
