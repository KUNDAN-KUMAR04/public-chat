/**
 * 💬 MESSAGES FEATURE
 * Send messages, display messages, manage message state
 * EVERYTHING related to messages in ONE file
 */

import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

class MessagesFeature {
    constructor() {
        this.replyTarget = null;
        this.fileToUpload = null;
        this.init();
    }

    init() {
        this.setupInputHandlers();
        this.setupEngineListen();
    }

    setupInputHandlers() {
        const sendBtn = document.querySelector('.send-btn');
        const msgInput = document.getElementById('m-in');

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        if (msgInput) {
            msgInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
    }

    setupEngineListen() {
        window.addEventListener('engine-booted', (e) => {
            console.log('Messages feature: Engine booted, starting message engine');
            this.startEngine(e.detail.mode);
        });
    }

    startEngine(mode) {
        const lim = mode === 'LITE' ? 20 : 100;
        const q = query(
            collection(window.db, "messages"),
            orderBy("createdAt", "desc"),
            limit(lim)
        );

        onSnapshot(q, (snap) => {
            const chat = document.getElementById('chat');
            if (!chat) return;

            chat.innerHTML = "";
            const msgs = [];
            snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
            
            msgs.reverse().forEach(data => {
                const div = this.createMessageElement(data);
                chat.appendChild(div);
            });

            chat.scrollTop = chat.scrollHeight;
        });
    }

    createMessageElement(data) {
        const div = document.createElement('div');
        const isMy = data.user === (document.getElementById('u-in').value || "Guest");
        div.className = `msg ${isMy ? 'my' : 'other'}`;
        div.id = `msg-${data.id}`;

        let html = `<b style="font-size:11px; color:#0084ff; display:block; margin-bottom:4px;">${data.user}</b>`;

        // Reply indicator
        if (data.reply) {
            html += `<div class="tree-container"><div class="tree-line"></div><div class="reply-preview-box">↳ "${data.reply.substring(0, 50)}${data.reply.length > 50 ? '...' : ''}"</div></div>`;
        }

        // Text or file
        if (data.file) {
            html += `<img src="${data.file}" style="width:100%; border-radius:10px; cursor:pointer; margin-top:6px;" onclick="window.open('${data.file}')">`;
        } else {
            html += `<span>${data.txt || ""}</span>`;
        }

        div.innerHTML = html;

        // Reply on double-click
        div.ondblclick = () => {
            this.startReply(data.txt || "Image/File", data.id);
        };

        return div;
    }

    async sendMessage() {
        const input = document.getElementById('m-in');
        if (!input.value.trim() && !this.fileToUpload) return;

        try {
            window.dispatchEvent(new CustomEvent('start-loading', { detail: { text: 'Sending...' } }));

            await addDoc(collection(window.db, "messages"), {
                user: document.getElementById('u-in').value || "Guest",
                txt: input.value,
                reply: this.replyTarget,
                createdAt: serverTimestamp()
            });

            input.value = "";
            this.cancelReply();
            
            window.dispatchEvent(new CustomEvent('stop-loading'));
        } catch (error) {
            console.error('Send error:', error);
            window.dispatchEvent(new CustomEvent('stop-loading'));
        }
    }

    startReply(text, id) {
        this.replyTarget = text;
        const rTag = document.getElementById('r-tag');
        if (rTag) {
            rTag.innerHTML = `Replying to: <b>${text}</b> <span onclick="window.messagesFeature.cancelReply()" style="float:right; cursor:pointer;">✕</span>`;
            rTag.style.display = 'block';
        }
    }

    cancelReply() {
        this.replyTarget = null;
        const rTag = document.getElementById('r-tag');
        if (rTag) {
            rTag.style.display = 'none';
        }
    }
}

// Initialize
window.messagesFeature = new MessagesFeature();
console.log('✅ Messages module loaded');
