/**
 * 🔍 MESSAGE SEARCH — Search and filter messages
 */

class MessageSearch {
    constructor() {
        this.isOpen = false;
        this.query  = '';
        this.createUI();
        this.bindShortcut();
    }

    createUI() {
        const overlay = document.createElement('div');
        overlay.id = 'search-overlay';
        overlay.className = 'search-overlay';
        overlay.style.display = 'none';
        overlay.innerHTML = `
            <div class="search-panel">
                <div class="search-header">
                    <span class="search-icon">🔍</span>
                    <input id="search-input" type="search" placeholder="Search messages…" autocomplete="off" spellcheck="false">
                    <button class="search-close" onclick="window.closeSearch()" aria-label="Close search">✕</button>
                </div>
                <div id="search-results" class="search-results">
                    <p class="search-hint">Type to search messages…</p>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#search-input');
        input.addEventListener('input', (e) => this.search(e.target.value));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });

        // Close overlay on backdrop click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });
    }

    bindShortcut() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.isOpen ? this.close() : this.open();
            }
        });
    }

    open() {
        this.isOpen = true;
        const overlay = document.getElementById('search-overlay');
        if (overlay) { overlay.style.display = 'flex'; }
        setTimeout(() => document.getElementById('search-input')?.focus(), 50);
    }

    close() {
        this.isOpen = false;
        const overlay = document.getElementById('search-overlay');
        if (overlay) { overlay.style.display = 'none'; }
        this.clearResults();
    }

    search(query) {
        this.query = query.trim().toLowerCase();
        const results = document.getElementById('search-results');
        if (!results) return;

        if (!this.query) {
            results.innerHTML = '<p class="search-hint">Type to search messages…</p>';
            return;
        }

        // Search DOM (no extra Firestore reads needed)
        const messages = [...document.querySelectorAll('[data-msg-id]')];
        const matches = messages.filter(el => {
            const text = el.querySelector('.msg-text')?.textContent?.toLowerCase() || '';
            const user = el.dataset.user?.toLowerCase() || '';
            return text.includes(this.query) || user.includes(this.query);
        });

        if (matches.length === 0) {
            results.innerHTML = '<p class="search-empty">No messages found</p>';
            return;
        }

        results.innerHTML = '';
        matches.slice(0, 30).forEach(el => {
            const text = el.querySelector('.msg-text')?.textContent || '📎 File';
            const user = el.dataset.user || 'Guest';
            const msgId = el.dataset.msgId;

            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.innerHTML = `
                <span class="sr-user">${escHtml(user)}</span>
                <span class="sr-text">${highlightMatch(escHtml(text), this.query)}</span>
            `;
            item.onclick = () => {
                this.close();
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.querySelector('.msg-bubble')?.classList.add('flash');
                setTimeout(() => el.querySelector('.msg-bubble')?.classList.remove('flash'), 1500);
            };
            results.appendChild(item);
        });

        if (matches.length > 30) {
            const more = document.createElement('p');
            more.className = 'search-hint';
            more.textContent = `Showing 30 of ${matches.length} results. Refine your search.`;
            results.appendChild(more);
        }
    }

    clearResults() {
        const results = document.getElementById('search-results');
        if (results) results.innerHTML = '<p class="search-hint">Type to search messages…</p>';
        const input = document.getElementById('search-input');
        if (input) input.value = '';
        this.query = '';
    }
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function highlightMatch(html, q) {
    const regex = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return html.replace(regex, '<mark>$1</mark>');
}

// ── Global API ─────────────────────────────────────────────────────────────────
const searchFeature = new MessageSearch();
window.openSearch  = () => searchFeature.open();
window.closeSearch = () => searchFeature.close();

console.log('✅ Message search module loaded');
