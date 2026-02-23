/**
 * 🚀 APP.JS — Main orchestrator
 * Imports all feature modules and wires them together.
 * No feature logic lives here — just bootstrap order.
 */

import './core.js';
import './messages.js';
import './file-upload.js';
import './reactions.js';
import './typing-indicator.js';
import './read-receipts.js';
import './message-search.js';
import './dark-mode.js';
import './user-colors.js';
import './active-users.js';
import './special-box.js';
import './wipe-system.js';
import './emoji-support.js';

console.log('✅ All modules loaded — waiting for boot');
