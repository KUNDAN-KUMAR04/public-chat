/**
 * 🌙 DARK MODE — Toggle dark/light with system preference detection
 */

class DarkMode {
    constructor() {
        this.key = 'um_darkmode';
        this.isDark = this.load();
        this.createToggle();
        this.apply();
        this.watchSystem();
    }

    load() {
        const stored = localStorage.getItem(this.key);
        if (stored !== null) return stored === 'true';
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    save() {
        localStorage.setItem(this.key, String(this.isDark));
    }

    apply() {
        document.documentElement.setAttribute('data-theme', this.isDark ? 'dark' : 'light');
        const btn = document.getElementById('dark-mode-btn');
        if (btn) btn.textContent = this.isDark ? '☀️' : '🌙';
        this.save();
    }

    toggle() {
        this.isDark = !this.isDark;
        this.apply();
    }

    createToggle() {
        const btn = document.createElement('button');
        btn.id = 'dark-mode-btn';
        btn.className = 'nav-icon-btn';
        btn.title = 'Toggle dark mode';
        btn.textContent = this.isDark ? '☀️' : '🌙';
        btn.onclick = () => this.toggle();

        // Insert into nav
        const nav = document.querySelector('.nav-right');
        if (nav) nav.prepend(btn);
    }

    watchSystem() {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            // Only follow system if user hasn't manually set it
            if (localStorage.getItem(this.key) === null) {
                this.isDark = e.matches;
                this.apply();
            }
        });
    }
}

window.darkMode = new DarkMode();

console.log('✅ Dark mode module loaded');
