/**
 * 🎨 USER COLORS — Each user picks a display color
 */

const PRESET_COLORS = [
    '#0084ff','#e91e63','#9c27b0','#ff5722',
    '#4caf50','#ff9800','#00bcd4','#607d8b',
    '#f44336','#3f51b5','#009688','#795548'
];

class UserColors {
    constructor() {
        this.key = 'um_colors';
        this.colors = this.load();
        this.createUI();
        this.listenForUsernameChange();
    }

    load() {
        try { return JSON.parse(localStorage.getItem(this.key) || '{}'); } catch { return {}; }
    }

    save() {
        localStorage.setItem(this.key, JSON.stringify(this.colors));
    }

    getColor(user) {
        if (!this.colors[user]) {
            // Auto-assign a consistent color based on username hash
            const idx = this.hashCode(user) % PRESET_COLORS.length;
            this.colors[user] = PRESET_COLORS[Math.abs(idx)];
            this.save();
        }
        return this.colors[user];
    }

    setColor(user, color) {
        this.colors[user] = color;
        this.save();
        // Re-render user's own messages
        document.querySelectorAll(`[data-user="${user}"] .msg-username`).forEach(el => {
            el.style.color = color;
        });
        document.querySelectorAll(`[data-user="${user}"] .msg-avatar`).forEach(el => {
            el.style.background = color;
        });
    }

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    createUI() {
        // Color dot next to username input
        const uIn = document.getElementById('u-in');
        if (!uIn) return;

        const dot = document.createElement('button');
        dot.id    = 'color-dot';
        dot.className = 'color-dot';
        dot.title = 'Change your color';
        dot.style.background = this.getColor(uIn.value || 'Guest');
        dot.onclick = (e) => {
            e.stopPropagation();
            this.showColorPicker(uIn.value || 'Guest', dot);
        };
        uIn.parentElement.insertBefore(dot, uIn);
    }

    showColorPicker(user, trigger) {
        document.getElementById('color-picker-popup')?.remove();

        const popup = document.createElement('div');
        popup.id = 'color-picker-popup';
        popup.className = 'color-picker-popup';

        PRESET_COLORS.forEach(color => {
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch';
            swatch.style.background = color;
            if (this.colors[user] === color) swatch.classList.add('selected');
            swatch.onclick = (e) => {
                e.stopPropagation();
                this.setColor(user, color);
                document.getElementById('color-dot').style.background = color;
                popup.remove();
            };
            popup.appendChild(swatch);
        });

        // Custom color input
        const custom = document.createElement('input');
        custom.type  = 'color';
        custom.value = this.colors[user] || '#0084ff';
        custom.className = 'color-custom';
        custom.oninput = (e) => {
            this.setColor(user, e.target.value);
            document.getElementById('color-dot').style.background = e.target.value;
        };
        popup.appendChild(custom);

        const rect = trigger.getBoundingClientRect();
        popup.style.position = 'fixed';
        popup.style.bottom   = `${window.innerHeight - rect.top + 8}px`;
        popup.style.left     = `${rect.left}px`;
        document.body.appendChild(popup);

        const close = (e) => {
            if (!popup.contains(e.target)) {
                popup.remove();
                document.removeEventListener('click', close);
            }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
    }

    listenForUsernameChange() {
        const uIn = document.getElementById('u-in');
        if (!uIn) return;
        uIn.addEventListener('input', () => {
            const dot = document.getElementById('color-dot');
            if (dot) dot.style.background = this.getColor(uIn.value || 'Guest');
        });
    }
}

window.userColors = new UserColors();

// Export for use in messages.js
window.getUserColorGlobal = (user) => window.userColors.getColor(user);

console.log('✅ User colors module loaded');
