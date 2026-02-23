/**
 * 👥 ACTIVE USERS — Cross-tab/window presence counter
 *
 * Since /presence is not in Firestore rules, we use:
 *   1. BroadcastChannel — instant cross-tab comms on same device/browser
 *   2. localStorage + storage events — fallback for older browsers / same device
 *
 * This gives accurate counts across multiple tabs and windows on the same device.
 * For true cross-device counts, add a /presence collection to your Firestore rules.
 */

const SESSION_ID = 'um_' + Math.random().toString(36).slice(2, 10);
const LS_KEY     = 'um_presence';
const STALE_MS   = 60_000; // 60s before a session is considered gone
const HB_MS      = 20_000; // heartbeat every 20s

let bc = null; // BroadcastChannel
let hbInterval = null;

window.addEventListener('engine-booted', () => {
    initPresence();
});

// ── Init ──────────────────────────────────────────────────────────────────────
function initPresence() {
    // BroadcastChannel for same-browser cross-tab messaging
    if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('um_presence_channel');
        bc.onmessage = () => updateWidget(readCount());
    }

    // Register this session
    writeSession();

    // Heartbeat — keep this session alive
    hbInterval = setInterval(() => {
        writeSession();
        updateWidget(readCount());
        bc?.postMessage({ type: 'heartbeat', id: SESSION_ID });
    }, HB_MS);

    // Listen for other tabs updating localStorage
    window.addEventListener('storage', (e) => {
        if (e.key === LS_KEY) updateWidget(readCount());
    });

    // Initial widget render
    updateWidget(readCount());

    // Clean up on page leave
    window.addEventListener('beforeunload', () => {
        clearInterval(hbInterval);
        removeSession();
        bc?.postMessage({ type: 'leave', id: SESSION_ID });
        bc?.close();
    });

    // Re-register when tab becomes visible again
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            writeSession();
            updateWidget(readCount());
        }
    });
}

// ── localStorage helpers ──────────────────────────────────────────────────────
function readSessions() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    } catch { return {}; }
}

function writeSessions(sessions) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(sessions)); } catch {}
}

function writeSession() {
    const sessions = readSessions();
    // Prune stale sessions
    const now = Date.now();
    Object.keys(sessions).forEach(id => {
        if (now - sessions[id] > STALE_MS) delete sessions[id];
    });
    sessions[SESSION_ID] = now;
    writeSessions(sessions);
}

function removeSession() {
    const sessions = readSessions();
    delete sessions[SESSION_ID];
    writeSessions(sessions);
}

function readCount() {
    const sessions = readSessions();
    const now = Date.now();
    return Object.values(sessions).filter(ts => now - ts < STALE_MS).length;
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

    const tier = count <= 5  ? { label: 'BASIC',  cls: 'tier-basic'  }
               : count <= 20 ? { label: 'MEDIUM', cls: 'tier-medium' }
               : count <= 100? { label: 'MAX',    cls: 'tier-max'    }
               :               { label: 'ULTRA',  cls: 'tier-ultra'  };

    widget.className = `active-users-widget ${tier.cls}`;
    widget.title     = `${tier.label} — ${count} tab${count !== 1 ? 's' : ''} open`;
    widget.innerHTML = `
        <span class="presence-dot"></span>
        <span class="presence-count">${count}</span>
        <span class="presence-label">online</span>
    `;
}

console.log('✅ Active users module loaded (localStorage/BroadcastChannel)');
