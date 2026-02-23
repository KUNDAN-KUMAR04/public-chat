/**
 * 👥 ACTIVE USERS FEATURE
 * Shows active users online: Basic, Medium, Max, Ultra
 * EVERYTHING about active users in ONE file
 */

class ActiveUsersFeature {
    constructor() {
        this.userId = this.generateUserId();
        this.init();
    }

    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    }

    init() {
        this.createWidget();
        this.startTracking();
    }

    createWidget() {
        const html = `
            <div id="active-users-widget">
                <span class="active-indicator"></span>
                <span id="active-count">0</span>
                <span class="active-label">Online</span>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    startTracking() {
        const updateCount = () => {
            const count = this.getActiveCount();
            const countEl = document.getElementById('active-count');
            const indicator = document.querySelector('.active-indicator');

            if (countEl) {
                countEl.textContent = count;
            }

            if (indicator) {
                if (count <= 5) {
                    indicator.className = 'active-indicator basic';
                    indicator.title = 'BASIC (1-5 users)';
                } else if (count <= 20) {
                    indicator.className = 'active-indicator medium';
                    indicator.title = 'MEDIUM (6-20 users)';
                } else if (count <= 100) {
                    indicator.className = 'active-indicator max';
                    indicator.title = 'MAX (21-100 users)';
                } else {
                    indicator.className = 'active-indicator ultra';
                    indicator.title = 'ULTRA (100+ users)';
                }
            }
        };

        // Track this user
        this.addUser();
        
        // Update every 30 seconds
        setInterval(() => {
            this.addUser();
            updateCount();
        }, 30000);

        // Initial update
        updateCount();
    }

    addUser() {
        try {
            const users = JSON.parse(localStorage.getItem('active_users') || '{}');
            users[this.userId] = Date.now();

            // Remove inactive users (5 minutes)
            const now = Date.now();
            Object.keys(users).forEach(id => {
                if (now - users[id] > 300000) {
                    delete users[id];
                }
            });

            localStorage.setItem('active_users', JSON.stringify(users));
        } catch (e) {
            console.log('User tracking not available');
        }
    }

    getActiveCount() {
        try {
            const users = JSON.parse(localStorage.getItem('active_users') || '{}');
            const now = Date.now();
            
            return Object.keys(users).filter(id => {
                return (now - users[id]) < 300000;
            }).length;
        } catch (e) {
            return 0;
        }
    }
}

// Initialize
window.activeUsersFeature = new ActiveUsersFeature();

console.log('✅ Active users module loaded');
