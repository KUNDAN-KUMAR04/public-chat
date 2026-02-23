/**
 * 💬 MESSAGES — WhatsApp/Telegram-style instant loading
 *
 * 3 techniques used (exactly how WA Web & Telegram Web work):
 *
 * 1. LOCAL-FIRST (IndexedDB):
 *    On page open → load last 200 msgs from IndexedDB instantly (no network).
 *    Firestore syncs in background. New/changed msgs update the cache.
 *
 * 2. OPTIMISTIC UI:
 *    Your message appears in the chat the instant you press Send,
 *    with a ⏳ pending indicator. Firestore confirms it asynchronously.
 *    If it fails → message turns red with a retry option.
 *
 * 3. DOM DIFFING:
 *    onSnapshot only adds/updates/removes the changed messages,
 *    never re-renders the whole list.
 */

import {
    collection, addDoc, updateDoc,
    query, orderBy, limit, onSnapshot,
    serverTimestamp, doc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { FEATURES } from './core.js';
import { cacheMessage, loadCached, removeCached, clearCache, trimCache } from './cache.js';

// ── State ─────────────────────────────────────────────────────────────────────
let replyingToId   = null;
let replyingToText = null;
let editingMsgId   = null;
let unsubMain      = null;
let cacheLoaded    = false;

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('engine-booted', ({ detail: { mode } }) => {
    startEngine(mode);
});

// ── Engine: load cache first, then sync Firestore ────────────────────────────
async function startEngine(mode) {
    if (unsubMain) { unsubMain(); unsubMain = null; }

    const chat = document.getElementById('chat');
    if (!chat) return;
    chat.innerHTML = '';
    cacheLoaded    = false;

    // ── STEP 1: Render from IndexedDB instantly ──
    const cached = await loadCached();
    if (cached.length > 0) {
        // Sort by createdAt (handle Firestore Timestamp or plain object)
        cached.sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
        cached.forEach(msg => {
            const el = buildMessageEl(msg.id, msg, parseInt(msg._depth || 0));
            if (!msg.parentId) {
                chat.appendChild(el);
            } else {
                attachUnderParent(el, msg.parentId);
            }
        });
        chat.scrollTop = chat.scrollHeight;
    }
    cacheLoaded = true;

    // ── STEP 2: Firestore live sync (fills gaps + live updates) ──
    const q = query(
        collection(window.db, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(FEATURES[mode].msgLimit)
    );

    unsubMain = onSnapshot(q,
        { includeMetadataChanges: false },
        (snapshot) => {
            snapshot.docChanges().forEach(({ type, doc: d }) => {
                const data  = d.data();
                const msgId = d.id;

                if (type === 'added') {
                    // Update cache
                    cacheMessage(msgId, data);

                    // Skip if already rendered (from cache or optimistic)
                    const existing = chat.querySelector(`[data-msg-id="${msgId}"]`);
                    if (existing) {
                        // If it was an optimistic message — confirm it
                        if (existing.classList.contains('optimistic')) {
                            existing.classList.remove('optimistic', 'pending');
                            existing.querySelector('.msg-status')?.remove();
                        }
                        return;
                    }

                    const el = buildMessageEl(msgId, data, data.parentId ? 1 : 0);
                    if (!data.parentId) {
                        chat.appendChild(el);
                    } else {
                        attachUnderParent(el, data.parentId);
                    }
                    chat.scrollTop = chat.scrollHeight;

                } else if (type === 'modified') {
                    cacheMessage(msgId, data);
                    const existing = document.querySelector(`[data-msg-id="${msgId}"]`);
                    if (!existing) return;
                    const depth  = parseInt(existing.dataset.depth || '0');
                    const fresh  = buildMessageEl(msgId, data, depth);
                    const tree   = existing.querySelector(':scope > .replies-tree');
                    existing.replaceWith(fresh);
                    if (tree) fresh.appendChild(tree);

                } else if (type === 'removed') {
                    removeCached(msgId);
                    document.querySelector(`[data-msg-id="${msgId}"]`)?.remove();
                }
            });

            // Trim cache occasionally
            trimCache();
        },
        (err) => console.error('Snapshot error:', err.code, err.message)
    );
}

// ── Attach reply under parent ─────────────────────────────────────────────────
function attachUnderParent(replyEl, parentId) {
    const parentWrapper = document.querySelector(`[data-msg-id="${parentId}"]`);
    if (!parentWrapper) return;
    let tree = parentWrapper.querySelector(':scope > .replies-tree');
    if (!tree) {
        tree = document.createElement('div');
        tree.className = 'replies-tree';
        parentWrapper.appendChild(tree);
    }
    if (!tree.querySelector(`[data-msg-id="${replyEl.dataset.msgId}"]`)) {
        tree.appendChild(replyEl);
    }
}

// ── Build message element ─────────────────────────────────────────────────────
function buildMessageEl(msgId, data, depth, isOptimistic = false) {
    const me       = currentUser();
    const isMine   = data.user === me;
    const features = FEATURES[window.engineMode] || FEATURES.MAX;
    const text     = data.text ?? data.txt ?? '';
    const fileURL  = data.fileURL ?? data.file ?? null;

    const wrapper = document.createElement('div');
    wrapper.className   = `msg-wrapper ${isMine ? 'mine' : 'theirs'} depth-${Math.min(depth,4)}${isOptimistic ? ' optimistic pending' : ''}`;
    wrapper.dataset.msgId = msgId;
    wrapper.dataset.depth = depth;
    wrapper.dataset.user  = data.user ?? '';

    // Avatar
    const avatar       = document.createElement('div');
    avatar.className   = 'msg-avatar';
    avatar.textContent = (data.user ?? 'G')[0].toUpperCase();
    avatar.style.background = data.userColor ?? '#0084ff';

    // Bubble
    const bubble     = document.createElement('div');
    bubble.className = `msg-bubble ${isMine ? 'bubble-mine' : 'bubble-theirs'}${data.deleted ? ' deleted' : ''}`;

    // Header
    const header = document.createElement('div');
    header.className = 'msg-header';
    const nameSpan       = document.createElement('span');
    nameSpan.className   = 'msg-username';
    nameSpan.textContent = data.user ?? 'Guest';
    nameSpan.style.color = isMine ? 'rgba(255,255,255,.9)' : (data.userColor ?? '#0084ff');
    header.appendChild(nameSpan);
    if (data.edited) {
        const ed = document.createElement('span');
        ed.className = 'msg-edited'; ed.textContent = '(edited)';
        header.appendChild(ed);
    }
    const timeEl = document.createElement('time');
    timeEl.className   = 'msg-time';
    timeEl.textContent = formatRelative(data.createdAt);
    timeEl.title       = formatFull(data.createdAt);
    header.appendChild(timeEl);
    bubble.appendChild(header);

    // Reply quote
    if (data.replyPreview) {
        const q = document.createElement('div');
        q.className = 'reply-quote';
        q.innerHTML = `<span class="rq-user">${esc(data.replyPreview.user??'')}</span>`
                    + `<span class="rq-text">${esc(clip(data.replyPreview.text??'📎',80))}</span>`;
        q.onclick   = () => flashMsg(data.parentId);
        bubble.appendChild(q);
    }

    // Content
    const content = document.createElement('div');
    content.className = 'msg-content';
    if (data.deleted) {
        content.innerHTML = '<em class="deleted-text">This message was deleted</em>';
    } else {
        if (text) {
            const p = document.createElement('p');
            p.className = 'msg-text'; p.textContent = text;
            content.appendChild(p);
        }
        if (data.fileCard) renderFileCard(content, data);
        else if (fileURL)  renderLegacyMedia(content, data, features); // backward compat
    }
    bubble.appendChild(content);

    // Full timestamp
    const tsRow = document.createElement('div');
    tsRow.className = 'msg-timestamp-row';
    tsRow.innerHTML = `<span class="msg-ts-full">${formatFull(data.createdAt)}</span>`;
    bubble.appendChild(tsRow);

    // Pending / failed status indicator (optimistic UI)
    if (isOptimistic) {
        const status = document.createElement('div');
        status.className = 'msg-status pending';
        status.textContent = '⏳ Sending…';
        bubble.appendChild(status);
    }

    // Reactions
    const reactEl = document.createElement('div');
    reactEl.className = `msg-reactions`;
    reactEl.id        = `reactions-${msgId}`;
    if (data.reactions) renderReactions(reactEl, data.reactions, msgId);
    bubble.appendChild(reactEl);

    // Actions
    if (!data.deleted && !isOptimistic) {
        const actions = document.createElement('div');
        actions.className = 'msg-actions';
        if (features.reactions) actions.appendChild(mkBtn('😊','React',  `window.showReactionPicker('${msgId}',this)`));
        if (features.replies)   actions.appendChild(mkBtn('↩', 'Reply',  `window.startReply('${msgId}',${JSON.stringify(clip(text||'📎',60))})`));
        if (features.edit&&isMine) actions.appendChild(mkBtn('✏️','Edit', `window.startEdit('${msgId}',${JSON.stringify(text)})`));
        if (features.pin)       actions.appendChild(mkBtn('📌','Pin',    `window.pinMessage('${msgId}')`));
        if (isMine)             actions.appendChild(mkBtn('🗑','Delete',  `window.deleteMessage('${msgId}')`, 'act-del'));
        bubble.appendChild(actions);
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    return wrapper;
}

function mkBtn(icon, title, onclick, cls='') {
    const b = document.createElement('button');
    b.className = `act-btn ${cls}`.trim();
    b.title = title; b.textContent = icon;
    b.setAttribute('onclick', onclick);
    return b;
}

// ── File card (instant, stored in Firestore doc) ──────────────────────────────
function renderFileCard(container, data) {
    const { fileThumb, fileIcon, fileName, fileSize, fileType, fileDuration } = data;
    const isVideo = fileType?.startsWith('video/');

    const card = document.createElement('div');
    card.className = 'file-card';

    if (fileThumb) {
        const wrap = document.createElement('div');
        wrap.className = 'file-card-img-wrap';
        const img = document.createElement('img');
        img.src = fileThumb; img.className = 'file-card-img';
        img.alt = fileName ?? 'file'; img.loading = 'lazy';
        wrap.appendChild(img);
        if (isVideo) {
            const play = document.createElement('div');
            play.className = 'file-card-play'; play.textContent = '▶';
            wrap.appendChild(play);
        }
        card.appendChild(wrap);
    } else {
        const icon = document.createElement('div');
        icon.className = 'file-card-big-icon';
        icon.textContent = fileIcon ?? '📎';
        card.appendChild(icon);
    }

    const info = document.createElement('div');
    info.className = 'file-card-info';
    const name = document.createElement('span');
    name.className = 'file-card-name'; name.textContent = fileName ?? 'File';
    const meta = document.createElement('span');
    meta.className = 'file-card-meta';
    meta.textContent = (fileSize ? fmtBytes(fileSize) : '') + (fileDuration ? ` · ${fileDuration}` : '');
    info.appendChild(name); info.appendChild(meta);
    card.appendChild(info);
    container.appendChild(card);
}

// Backward compat: old messages that used Firebase Storage URL
function renderLegacyMedia(container, data, features) {
    const { fileURL, fileType, fileName } = data;
    if (!fileURL) return;
    if (fileType?.startsWith('image/') && features.images) {
        const img = document.createElement('img');
        img.src = fileURL; img.className = 'msg-img'; img.loading = 'lazy';
        img.alt = fileName??'image'; img.onclick = ()=>window.open(fileURL,'_blank');
        container.appendChild(img);
    } else if (fileType?.startsWith('video/') && features.videos) {
        const v = document.createElement('video');
        v.src = fileURL; v.controls = true; v.className = 'msg-video';
        container.appendChild(v);
    } else if (fileType?.startsWith('audio/') && features.audio) {
        const a = document.createElement('audio');
        a.src = fileURL; a.controls = true; a.className = 'msg-audio';
        container.appendChild(a);
    } else {
        const l = document.createElement('a');
        l.href = fileURL; l.target = '_blank'; l.rel = 'noopener noreferrer';
        l.className = 'msg-file-link';
        l.innerHTML = `📄 <span>${esc(fileName??'Download file')}</span>`;
        container.appendChild(l);
    }
}

function renderReactions(container, reactions, msgId) {
    container.innerHTML = '';
    if (!reactions || typeof reactions !== 'object') return;
    const counts = {}; const me = currentUser();
    Object.entries(reactions).forEach(([user, emoji]) => {
        if (!counts[emoji]) counts[emoji] = { n:0, mine:false };
        counts[emoji].n++;
        if (user === me) counts[emoji].mine = true;
    });
    Object.entries(counts).forEach(([emoji, { n, mine }]) => {
        const btn = document.createElement('button');
        btn.className = `reaction-pill${mine?' reaction-mine':''}`;
        btn.textContent = `${emoji} ${n}`;
        btn.onclick = ()=>window.toggleReaction(msgId, emoji);
        container.appendChild(btn);
    });
}

// ── SEND — Optimistic UI (WhatsApp-style) ─────────────────────────────────────
window.sendMessage = async () => {
    const input = document.getElementById('m-in');
    const text  = (input?.value ?? '').trim();
    if (!text && !window._pendingFile) return;

    // Edit mode
    if (editingMsgId) {
        try {
            await updateDoc(doc(window.db, 'messages', editingMsgId), {
                text, edited: true, editedAt: serverTimestamp()
            });
        } catch (err) { console.error('Edit failed:', err); }
        cancelEdit(); if (input) input.value = '';
        return;
    }

    const user    = currentUser();
    const tmpId   = 'tmp_' + Date.now();   // temporary local ID
    const chat    = document.getElementById('chat');
    const payload = {
        user,
        userColor:    getUserColor(user),
        text,
        parentId:     replyingToId ?? null,
        replyPreview: replyingToId
            ? { user: replyingToText?.user??'', text: replyingToText?.text??'' }
            : null,
        createdAt:    { seconds: Math.floor(Date.now()/1000), nanoseconds: 0 },
        deleted:      false,
        edited:       false
    };

    // ── Show message instantly (optimistic) ──
    const optimisticEl = buildMessageEl(tmpId, payload, 0, true);
    if (chat) { chat.appendChild(optimisticEl); chat.scrollTop = chat.scrollHeight; }

    if (input) input.value = '';
    cancelReply();
    window.dispatchEvent(new CustomEvent('typing-stop'));

    // ── Send to Firestore in background ──
    try {
        await addDoc(collection(window.db, 'messages'), {
            ...payload,
            createdAt: serverTimestamp()   // replace local estimate with server time
        });
        // onSnapshot will confirm and remove the optimistic element
    } catch (err) {
        console.error('Send failed:', err);
        // Mark as failed — show retry button
        optimisticEl.classList.remove('pending');
        optimisticEl.classList.add('failed');
        const status = optimisticEl.querySelector('.msg-status');
        if (status) {
            status.className = 'msg-status failed';
            status.innerHTML = `❌ Failed · <button onclick="retryMessage('${tmpId}')">Retry</button>`;
        }
    }
};

// Retry a failed optimistic message
window.retryMessage = (tmpId) => {
    const el = document.querySelector(`[data-msg-id="${tmpId}"]`);
    if (!el) return;
    const text = el.querySelector('.msg-text')?.textContent ?? '';
    el.remove();
    const input = document.getElementById('m-in');
    if (input) { input.value = text; window.sendMessage(); }
};

// ── Reply ─────────────────────────────────────────────────────────────────────
window.startReply = (msgId, msgText) => {
    replyingToId   = msgId;
    const uEl      = document.querySelector(`[data-msg-id="${msgId}"] .msg-username`);
    replyingToText = { text: msgText, user: uEl?.textContent??'' };
    cancelEdit();
    const tag = document.getElementById('r-tag');
    if (tag) {
        tag.style.display = 'flex';
        tag.querySelector('.reply-tag-text').textContent =
            `↩ ${replyingToText.user}: ${clip(msgText,50)}`;
    }
    document.getElementById('m-in')?.focus();
};
window.cancelReply = () => {
    replyingToId = replyingToText = null;
    const tag = document.getElementById('r-tag');
    if (tag) tag.style.display = 'none';
};

// ── Edit ──────────────────────────────────────────────────────────────────────
window.startEdit = (msgId, currentText) => {
    editingMsgId = msgId; cancelReply();
    const input = document.getElementById('m-in');
    if (input) { input.value = currentText; input.focus(); }
    const tag = document.getElementById('r-tag');
    if (tag) {
        tag.style.display = 'flex';
        tag.querySelector('.reply-tag-text').textContent = '✏️ Editing message…';
        tag.classList.add('editing');
    }
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.textContent = '✔';
};
function cancelEdit() {
    editingMsgId = null;
    const tag = document.getElementById('r-tag');
    if (tag) { tag.style.display='none'; tag.classList.remove('editing'); }
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) sendBtn.textContent = '📤';
}
window.cancelReplyOrEdit = () => { cancelEdit(); window.cancelReply(); };

// ── Soft-delete ───────────────────────────────────────────────────────────────
window.deleteMessage = async (msgId) => {
    if (!confirm('Delete this message?')) return;
    try {
        await updateDoc(doc(window.db,'messages',msgId), {
            deleted:true, text:'', fileURL:null
        });
    } catch (err) { console.error('Delete failed:',err); }
};

// ── Flash message ─────────────────────────────────────────────────────────────
function flashMsg(msgId) {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior:'smooth', block:'center' });
    const b = el.querySelector('.msg-bubble');
    if (b) { b.classList.add('flash'); setTimeout(()=>b.classList.remove('flash'),1500); }
}

// ── Input wiring ──────────────────────────────────────────────────────────────
function wireInput() {
    const input = document.getElementById('m-in');
    if (!input || input.dataset.wired) return;
    input.dataset.wired = '1';
    input.addEventListener('keydown', (e) => {
        if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); window.sendMessage(); }
        if (e.key==='Escape') window.cancelReplyOrEdit();
    });
    input.addEventListener('input', () => {
        window.dispatchEvent(new CustomEvent('typing-start'));
    });
}
if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', wireInput);
} else { wireInput(); }

// ── Expose clearCache for wipe-system.js ─────────────────────────────────────
window.clearMessageCache = clearCache;

// ── Helpers / exports ─────────────────────────────────────────────────────────
export function currentUser() {
    return (document.getElementById('u-in')?.value??'').trim() || 'Guest';
}
export function getUserColor(user) {
    try { return JSON.parse(localStorage.getItem('um_colors')??'{}')[user]??'#0084ff'; }
    catch { return '#0084ff'; }
}

function formatRelative(ts) {
    const d = tsToDate(ts);
    if (!d) return '';
    const m = Math.floor((Date.now()-d.getTime())/60000);
    if (m<1) return 'now'; if (m<60) return `${m}m`;
    if (m<1440) return `${Math.floor(m/60)}h`;
    if (m<10080) return `${Math.floor(m/1440)}d`;
    return d.toLocaleDateString();
}
function formatFull(ts) {
    const d = tsToDate(ts);
    if (!d) return '';
    return d.toLocaleString(undefined,{
        weekday:'short',day:'numeric',month:'short',
        year:'numeric',hour:'2-digit',minute:'2-digit'
    });
}
function tsToDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate==='function') return ts.toDate();
    if (ts instanceof Date) return ts;
    if (typeof ts==='number') return new Date(ts);
    if (ts.seconds) return new Date(ts.seconds*1000);
    return null;
}
function toMs(ts) {
    const d = tsToDate(ts); return d ? d.getTime() : 0;
}
function fmtBytes(b) {
    if (!b) return '';
    if (b<1024) return `${b} B`;
    if (b<1_048_576) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1_048_576).toFixed(1)} MB`;
}
function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
                    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function clip(s,n) { return s.length>n ? s.slice(0,n)+'…' : s; }

export { renderReactions };
console.log('✅ Messages module loaded (local-first + optimistic UI)');
