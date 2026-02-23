/**
 * 📁 FILE UPLOAD — All file types: image, video, audio, pdf, docs, etc.
 */

import {
    collection, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
    ref, uploadBytesResumable, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js';
import { FEATURES } from './core.js';
import { currentUser, getUserColor } from './messages.js';

// ── Accepted file types per mode ──────────────────────────────────────────────
const ACCEPT = {
    MAX:   'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar',
    SMART: 'image/*,video/*,audio/*,.pdf,.txt',
    LITE:  'image/*'
};

let pendingFile = null;
window._pendingFile = null;

// ── DOM setup ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('f-in');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
});

window.addEventListener('engine-booted', ({ detail: { mode } }) => {
    const fileInput = document.getElementById('f-in');
    if (fileInput) {
        fileInput.accept = ACCEPT[mode] || ACCEPT.LITE;
        fileInput.style.display = 'none';
    }
    const uploadBtn = document.getElementById('upload-btn');
    if (uploadBtn) {
        // Hide upload button in LITE mode if images disabled
        uploadBtn.style.display = FEATURES[mode].images ? '' : 'none';
    }
});

// ── File select handler ───────────────────────────────────────────────────────
async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const mode = window.engineMode;
    const features = FEATURES[mode];

    // Validate
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');

    if (isVideo && !features.videos) {
        alert(`❌ Video not supported in ${mode} mode. Switch to SMART or MAX.`);
        e.target.value = ''; return;
    }
    if (isAudio && !features.audio) {
        alert(`❌ Audio not supported in ${mode} mode. Switch to SMART or MAX.`);
        e.target.value = ''; return;
    }
    if (!isImage && !isVideo && !isAudio && !features.files) {
        alert(`❌ File uploads not supported in ${mode} mode. Switch to MAX.`);
        e.target.value = ''; return;
    }

    // Size check: 50MB max
    if (file.size > 50 * 1024 * 1024) {
        alert('❌ File too large. Max 50MB.');
        e.target.value = ''; return;
    }

    pendingFile = file;
    window._pendingFile = file;
    showPreview(file);
    e.target.value = '';
}

// ── Preview ───────────────────────────────────────────────────────────────────
function showPreview(file) {
    const popup  = document.getElementById('media-pop');
    const img    = document.getElementById('pop-img');
    const vidPre = document.getElementById('pop-vid');
    const audPre = document.getElementById('pop-aud');
    const filePre= document.getElementById('pop-file');

    // Hide all previews first
    [img, vidPre, audPre, filePre].forEach(el => { if (el) el.style.display = 'none'; });

    const url = URL.createObjectURL(file);

    if (file.type.startsWith('image/') && img) {
        img.src = url;
        img.style.display = 'block';
    } else if (file.type.startsWith('video/') && vidPre) {
        vidPre.src = url;
        vidPre.style.display = 'block';
    } else if (file.type.startsWith('audio/') && audPre) {
        audPre.src = url;
        audPre.style.display = 'block';
    } else if (filePre) {
        filePre.textContent = `📄 ${file.name} (${formatBytes(file.size)})`;
        filePre.style.display = 'block';
    }

    if (popup) popup.style.display = 'flex';

    // Set caption if any text in input
    const caption = document.getElementById('pop-caption');
    if (caption) caption.value = document.getElementById('m-in')?.value || '';
}

// ── Cancel ────────────────────────────────────────────────────────────────────
window.cancelUpload = () => {
    pendingFile = null;
    window._pendingFile = null;
    const popup = document.getElementById('media-pop');
    if (popup) popup.style.display = 'none';
    // Revoke object URLs
    ['pop-img','pop-vid','pop-aud'].forEach(id => {
        const el = document.getElementById(id);
        if (el?.src?.startsWith('blob:')) { URL.revokeObjectURL(el.src); el.src = ''; }
    });
};

// ── Confirm upload ────────────────────────────────────────────────────────────
window.confirmUpload = async () => {
    if (!pendingFile) return;

    const btn = document.getElementById('upload-confirm-btn');
    const bar = document.getElementById('upload-progress-bar');
    const barWrap = document.getElementById('upload-progress-wrap');

    if (btn) { btn.textContent = 'Uploading…'; btn.disabled = true; }
    if (barWrap) barWrap.style.display = 'block';

    try {
        const path   = `media/${Date.now()}_${sanitizeFileName(pendingFile.name)}`;
        const sRef   = ref(window.st, path);
        const task   = uploadBytesResumable(sRef, pendingFile);

        // Progress
        task.on('state_changed', (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            if (bar) bar.style.width = `${pct}%`;
        });

        await task;
        const url = await getDownloadURL(sRef);

        const caption = document.getElementById('pop-caption')?.value.trim() || '';
        const user    = currentUser();

        await addDoc(collection(window.db, 'messages'), {
            user,
            userColor:  getUserColor(user),
            text:       caption,
            fileURL:    url,
            fileType:   pendingFile.type,
            fileName:   pendingFile.name,
            fileSize:   pendingFile.size,
            parentId:   null,
            replyPreview: null,
            createdAt:  serverTimestamp(),
            deleted:    false,
            edited:     false
        });

        window.cancelUpload();
    } catch (err) {
        console.error('Upload error:', err);
        alert('❌ Upload failed. Please try again.');
    } finally {
        if (btn) { btn.textContent = 'Send'; btn.disabled = false; }
        if (barWrap) barWrap.style.display = 'none';
        if (bar) bar.style.width = '0%';
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/1024/1024).toFixed(1) + ' MB';
}

function sanitizeFileName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

console.log('✅ File upload module loaded');
