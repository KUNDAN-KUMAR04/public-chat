/**
 * 💬 MESSAGES — Send, display, edit, soft-delete, reply tree
 *
 * Key fixes:
 *  - Removed where('parentId','==',null) from main query — required a composite
 *    Firestore index that may not exist, causing silent failures. Top-level vs reply
 *    messages are now filtered client-side.
 *  - Added onSnapshot error callback so failures are visible in the console.
 *  - Old messages without a parentId field are treated as top-level (parentId = null).
 */

import {
    collection, addDoc, updateDoc,
    query, orderBy, limit, where, onSnapshot,
    serverTimestamp, doc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { FEATURES } from './core.js';

// ── State ─────────────────────────────────────────────────────────────────────
let replyingToId    = null;
let replyingToText  = null;
let editingMsgId    = null;
let unsubscribeMain = null;

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('engine-booted', ({ detail: { mode } }) => {
    startMessageEngine(mode);
});

// ── Engine ────────────────────────────────────────────────────────────────────
function startMessageEngine(mode) {
    if (unsubscribeMain) unsubscribeMain();

    const lim = FEATURES[mode].msgLimit;

    // NO where() clause — avoids needing a composite Firestore index.
    // Top-level vs reply filtering is done client-side below.
    const q = query(
        collection(window.db, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(lim)
    );

    unsubscribeMain = onSnapshot(q,
        (snap) => {
            const chat = document.getElementById('chat');
            if (!chat) return;

            snap.docChanges().forEach(change => {
                const { type, doc: d } = change;
                const data = d.data();

                // A message is top-level when parentId is null, undefined, or missing
                const isTopLevel = !data.parentId;

                if (type === 'added') {
                    if (isTopLevel) {
                        // Only append if not already in DOM (handles re-boot)
                        if (!document.querySelector(`[data-msg-id="${d.id}"]`)) {
                            const el = buildMessageEl(d.id, data, 0);
                            chat.appendChild(el);
                        }
                    } else {
                        // It's a reply — attach under its parent
                        attachReply(d.id, data);
                    }
                } else if (type === 'modified') {
                    const existing = document.querySelector(`[data-msg-id="${d.id}"]`);
                    if (existing) {
                        const depth   = parseInt(existing.dataset.depth || '0');
                        const updated = buildMessageEl(d.id, data, depth);
                        const replies = existing.querySelector(':scope > .replies-tree');
                        existing.replaceWith(updated);
                        if (replies) updated.appendChild(replies);
                    }
                } else if (type === 'removed') {
                    document.querySelector(`[data-msg-id="${d.id}"]`)?.remove();
                }
            });

            chat.scrollTop = chat.scrollHeight;
        },
        (err) => {
            // Make errors visible — common cause: missing Firestore index
            console.error('❌ Messages snapshot error:', err.code, err.message);
            if (err.code === 'failed-precondition') {
                console.error('👉 Firestore needs an index. Check the Firebase Console for a link to create it.');
            }
        }
    );
}

// Attach a reply message under its parent in the DOM
function attachReply(msgId, data) {
    const parentEl = document.querySelector(`[data-msg-id="${data.parentId}"]`);
    if (!parentEl) return; // parent not loaded yet — will be attached when parent loads

    let tree = parentEl.querySelector(':scope > .replies-tree');
    if (!tree) {
        tree = document.createElement('div');
        tree.className = 'replies-tree';
        parentEl.appendChild(tree);
    }

    if (!tree.querySelector(`[data-msg-id="${msgId}"]`)) {
        const depth = parseInt(parentEl.dataset.depth || '0') + 1;
        const el = buildMessageEl(msgId, data, depth);
        tree.appendChild(el);
    }
}

// ── Build message element ─────────────────────────────────────────────────────
function buildMessageEl(msgId, data, depth) {
    const myName   = currentUser();
    const isMy     = data.user === myName;
    const features = FEATURES[window.engineMode] || FEATURES['MAX'];

    const wrapper = document.createElement('div');
    wrapper.className = `msg-wrapper ${isMy ? 'mine' : 'theirs'} depth-${Math.min(depth, 4)}`;
    wrapper.dataset.msgId = msgId;
    wrapper.dataset.depth = depth;
    wrapper.dataset.user  = data.user || '';

    // Avatar
    const avatar = document.createElement('div');
    avatar.className   = 'msg-avatar';
    avatar.textContent = (data.user || 'G')[0].toUpperCase();
    avatar.style.background = data.userColor || '#0084ff';

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = `msg-bubble ${isMy ? 'bubble-mine' : 'bubble-theirs'}`;
    if (data.deleted) bubble.classList.add('deleted');

    // Header
    const header = document.createElement('div');
    header.className = 'msg-header';
    header.innerHTML = `
        <span class="msg-username" style="color:${isMy ? 'rgba(255,255,255,.9)' : (data.userColor || '#0084ff')}">${escHtml(data.user || 'Guest')}</span>
        <span class="msg-time">${formatTime(data.createdAt)}</span>
        ${data.edited ? '<span class="msg-edited">edited</span>' : ''}
    `;
    bubble.appendChild(header);

    // Reply quote
    if (data.replyPreview) {
        const rp = document.createElement('div');
        rp.className = 'reply-quote';
        rp.innerHTML = `
            <span class="rq-user">${escHtml(data.replyPreview.user || '')}</span>
            <span class="rq-text">${escHtml(truncate(data.replyPreview.text || '📎 File', 80))}</span>
        `;
        rp.onclick = () => scrollToMessage(data.parentId);
        bubble.appendChild(rp);
    }

    // Content
    const content = document.createElement('div');
    content.className = 'msg-content';

    if (data.deleted) {
        content.innerHTML = '<em class="deleted-text">This message was deleted</em>';
    } else {
        // Support both old field name (txt) and new (text)
        const text = data.text || data.txt || '';
        if (text) {
            const p = document.createElement('p');
            p.className  = 'msg-text';
            p.textContent = text;
            content.appendChild(p);
        }
        // Support both old field name (file) and new (fileURL)
        const fileURL = data.fileURL || data.file || null;
        if (fileURL) {
            renderFileContent(content, { ...data, fileURL }, features);
        }
    }
    bubble.appendChild(content);

    // Reactions
    const reactionsEl = document.createElement('div');
    reactionsEl.className = 'msg-reactions';
    reactionsEl.id = `reactions-${msgId}`;
    if (data.reactions) renderReactions(reactionsEl, data.reactions, msgId);
    bubble.appendChild(reactionsEl);

    // Actions
    if (!data.deleted) {
        const actions = document.createElement('div');
        actions.className = 'msg-actions';
        actions.innerHTML = `
            ${features.reactions ? `<button class="act-btn" title="React" onclick="window.showReactionPicker('${msgId}',this)">😊</button>` : ''}
            ${features.replies   ? `<button class="act-btn" title="Reply" onclick="window.startReply('${msgId}',${JSON.stringify(truncate(data.text || data.txt || '📎', 60))})">↩</button>` : ''}
            ${features.edit && isMy ? `<button class="act-btn" title="Edit" onclick="window.startEdit('${msgId}',${JSON.stringify(data.text || data.txt || '')})">✏️</button>` : ''}
            ${isMy ? `<button class="act-btn act-del" title="Delete" onclick="window.deleteMessage('${msgId}')">🗑</button>` : ''}
        `;
        bubble.appendChild(actions);
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    return wrapper;
}

function renderFileContent(container, data, features) {
    const { fileURL, fileType, fileName } = data;
    if (!fileURL) return;

    if (fileType?.startsWith('image/') && features.images) {
        const img = document.createElement('img');
        img.src       = fileURL;
        img.className = 'msg-img';
        img.loading   = 'lazy';
        img.alt       = 'image';
        img.onclick   = () => window.open(fileURL, '_blank');
        container.appendChild(img);

    } else if (fileType?.startsWith('video/') && features.videos) {
        const vid = document.createElement('video');
        vid.src       = fileURL;
        vid.controls  = true;
        vid.className = 'msg-video';
        container.appendChild(vid);

    } else if (fileType?.startsWith('audio/') && features.audio) {
        const aud = document.createElement('audio');
        aud.src       = fileURL;
        aud.controls  = true;
        aud.className = 'msg-audio';
        container.appendChild(aud);

    } else {
        const link = document.createElement('a');
        link.href      = fileURL;
        link.target    = '_blank';
        link.className = 'msg-file-link';
        link.innerHTML = `📄 <span>${escHtml(fileName || 'Download file')}</span>`;
        container.appendChild(link);
    }
}

function renderReactions(container, reactions, msgId) {
    container.innerHTML = '';
    if (!reactions || typeof reactions !== 'object') return;
    const counts = {};
    const myName = currentUser();
    Object.entries(reactions).forEach(([user, emoji]) => {
        if (!counts[emoji]) counts[emoji] = { count: 0, iMine: false };
        counts[emoji].count++;
        if (user === myName) counts[emoji].iMine = true;
    });
    Object.entries(counts).forEach(([emoji, { count, iMine }]) => {
        const btn = document.createElement('button');
        btn.className   = `reaction-pill ${iMine ? 'reaction-mine' : ''}`;
        btn.textContent = `${emoji} ${count}`;
        btn.onclick     = () => window.toggleReaction(msgId, emoji);
        container.appendChild(btn);
    });
}

// ── Send ──────────────────────────────────────────────────────────────────────
window.sendMessage = async () => {
    const input = document.getElementById('m-in');
    const text  = input?.value.trim();
    if (!text && !window._pendingFile) return;

    // Editing an existing message
    if (editingMsgId) {
        try {
            await updateDoc(doc(window.db, 'messages', editingMsgId), {
                text,
                edited:   true,
                editedAt: serverTimestamp()
            });
        } catch (err) {
            console.error('Edit error:', err);
        }
        cancelEdit();
        if (input) input.value = '';
        return;
    }

    const user = currentUser();
    const payload = {
        user,
        userColor:    getUserColor(user),
        text:         text || '',
        parentId:     replyingToId  || null,
        replyPreview: replyingToId  ? { user: replyingToText?.user || '', text: replyingToText?.text || '' } : null,
        createdAt:    serverTimestamp(),
        deleted:      false,
        edited:       false
    };

    try {
        await addDoc(collection(window.db, 'messages'), payload);
        if (input) input.value = '';
        cancelReply();
        window.dispatchEvent(new CustomEvent('typing-stop'));
    } catch (err) {
        console.error('❌ Send error:', err);
        alert('Failed to send message. Check console for details.');
    }
};

// ── Reply ─────────────────────────────────────────────────────────────────────
window.startReply = (msgId, msgText) => {
    replyingToId   = msgId;
    const senderEl = document.querySelector(`[data-msg-id="${msgId}"] .msg-username`);
    replyingToText = { text: msgText, user: senderEl?.textContent || '' };
    cancelEdit();
    const tag = document.getElementById('r-tag');
    if (tag) {
        tag.style.display = 'flex';
        tag.querySelector('.reply-tag-text').textContent =
            `↩ ${replyingToText.user}: ${truncate(msgText, 50)}`;
    }
    document.getElementById('m-in')?.focus();
};

window.cancelReply = () => {
    replyingToId   = null;
    replyingToText = null;
    const tag = document.getElementById('r-tag');
    if (tag) tag.style.display = 'none';
};

// ── Edit ──────────────────────────────────────────────────────────────────────
window.startEdit = (msgId, currentText) => {
    editingMsgId = msgId;
    cancelReply();
    const input = document.getElementById('m-in');
    if (input) { input.value = currentText; input.focus(); }
    const tag = document.getElementById('r-tag');
    if (tag) {
        tag.style.display = 'flex';
        tag.querySelector('.reply-tag-text').textContent = '✏️ Editing message';
        tag.classList.add('editing');
    }
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.textContent = '✔';
};

function cancelEdit() {
    editingMsgId = null;
    const tag = document.getElementById('r-tag');
    if (tag) { tag.style.display = 'none'; tag.classList.remove('editing'); }
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.textContent = '📤';
}

window.cancelReplyOrEdit = () => { cancelEdit(); window.cancelReply(); };

// ── Soft-delete ───────────────────────────────────────────────────────────────
window.deleteMessage = async (msgId) => {
    if (!confirm('Delete this message?')) return;
    try {
        await updateDoc(doc(window.db, 'messages', msgId), {
            deleted: true, text: '', fileURL: null
        });
    } catch (err) {
        console.error('Delete error:', err);
    }
};

// ── Scroll to message ─────────────────────────────────────────────────────────
function scrollToMessage(msgId) {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector('.msg-bubble')?.classList.add('flash');
    setTimeout(() => el.querySelector('.msg-bubble')?.classList.remove('flash'), 1500);
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('m-in');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window.sendMessage(); }
            if (e.key === 'Escape') window.cancelReplyOrEdit();
        });
        input.addEventListener('input', () => {
            window.dispatchEvent(new CustomEvent('typing-start'));
        });
    }
});

// ── Exports & helpers ─────────────────────────────────────────────────────────
export function currentUser() {
    return document.getElementById('u-in')?.value.trim() || 'Guest';
}

export function getUserColor(user) {
    try { return JSON.parse(localStorage.getItem('um_colors') || '{}')[user] || '#0084ff'; }
    catch { return '#0084ff'; }
}

function formatTime(ts) {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const diff  = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)    return 'now';
    if (m < 60)   return `${m}m`;
    if (m < 1440) return `${Math.floor(m / 60)}h`;
    if (m < 10080)return `${Math.floor(m / 1440)}d`;
    return date.toLocaleDateString();
}

function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + '…' : s;
}

export { renderReactions };

console.log('✅ Messages module loaded');
