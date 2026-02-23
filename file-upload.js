/**
 * 📁 FILE UPLOAD — Instant template-based sharing
 *
 * NO Firebase Storage uploads. Everything is stored as a compact
 * "file card" template directly in the Firestore message document.
 *
 * How each file type is handled:
 *   Images  → Canvas resize to max 280px, JPEG quality 0.55 (~8–20 KB base64)
 *             stored as fileThumb in the message doc. Instant send.
 *   Videos  → First frame extracted via Canvas as thumbnail + metadata card
 *   Audio   → Styled card with filename + duration. No data stored.
 *   Docs/PDF/Zip/etc → Styled icon card with name + size. No data stored.
 *
 * Firestore document limit is 1 MB. Compressed thumbs stay well under that.
 */

import { collection, addDoc, serverTimestamp }
    from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { FEATURES } from './core.js';
import { currentUser, getUserColor } from './messages.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const THUMB_MAX_PX  = 280;    // max width or height of thumbnail
const THUMB_QUALITY = 0.55;   // JPEG quality (0.55 ≈ 10–25 KB for most photos)
const THUMB_LIMIT   = 900_000; // ~900 KB — Firestore doc soft safety limit

const ACCEPT = {
    MAX:   'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv',
    SMART: 'image/*,video/*,audio/*,.pdf,.txt',
    LITE:  'image/*'
};

// File type → display icon
const FILE_ICONS = {
    'application/pdf':                                          '📄',
    'application/msword':                                       '📝',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
    'application/vnd.ms-excel':                                 '📊',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
    'application/vnd.ms-powerpoint':                            '📊',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📊',
    'application/zip':                                          '🗜️',
    'application/x-rar-compressed':                             '🗜️',
    'text/plain':                                               '📃',
    'text/csv':                                                 '📊',
    'default':                                                  '📎'
};

let pendingFile     = null;
let pendingThumb    = null;   // { dataURL, width, height, type }
let pendingMeta     = null;   // { fileName, fileSize, fileType, duration? }

window._pendingFile = null;

// ── Wire file input (safe for ES modules) ────────────────────────────────────
function wireFileInput() {
    const fi = document.getElementById('f-in');
    if (!fi || fi.dataset.wired) return;
    fi.dataset.wired = '1';
    fi.addEventListener('change', handleFileSelect);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireFileInput);
} else {
    wireFileInput();
}

window.addEventListener('engine-booted', ({ detail: { mode } }) => {
    wireFileInput();
    const fi = document.getElementById('f-in');
    if (fi) fi.accept = ACCEPT[mode] || ACCEPT.LITE;
    const btn = document.getElementById('upload-btn');
    if (btn) btn.style.display = FEATURES[mode].images ? '' : 'none';
});

// ── File selected ─────────────────────────────────────────────────────────────
async function handleFileSelect(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const mode     = window.engineMode;
    const features = FEATURES[mode];
    const isImage  = file.type.startsWith('image/');
    const isVideo  = file.type.startsWith('video/');
    const isAudio  = file.type.startsWith('audio/');

    // Mode capability checks
    if (isVideo && !features.videos) {
        return alert(`❌ Video not supported in ${mode} mode. Switch to SMART or MAX.`);
    }
    if (isAudio && !features.audio) {
        return alert(`❌ Audio not supported in ${mode} mode. Switch to SMART or MAX.`);
    }
    if (!isImage && !isVideo && !isAudio && !features.files) {
        return alert(`❌ File sharing not supported in ${mode} mode. Switch to MAX.`);
    }

    pendingFile          = file;
    window._pendingFile  = file;
    pendingThumb         = null;
    pendingMeta          = { fileName: file.name, fileSize: file.size, fileType: file.type };

    showPopupLoading();

    try {
        if (isImage) {
            pendingThumb = await compressImage(file);
        } else if (isVideo) {
            pendingThumb = await extractVideoFrame(file);
        } else if (isAudio) {
            pendingMeta.duration = await getAudioDuration(file);
        }
    } catch (err) {
        console.warn('Preview generation failed (non-fatal):', err);
    }

    showPopupPreview();
}

// ── Compress image via Canvas ─────────────────────────────────────────────────
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;

            // Scale down to THUMB_MAX_PX on the longest side
            if (width > THUMB_MAX_PX || height > THUMB_MAX_PX) {
                const ratio = THUMB_MAX_PX / Math.max(width, height);
                width  = Math.round(width  * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width  = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Start at target quality, reduce until under limit
            let quality = THUMB_QUALITY;
            let dataURL = canvas.toDataURL('image/jpeg', quality);

            while (dataURL.length > THUMB_LIMIT && quality > 0.15) {
                quality -= 0.1;
                dataURL = canvas.toDataURL('image/jpeg', quality);
            }

            resolve({ dataURL, width, height, type: 'image/jpeg' });
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
        img.src = url;
    });
}

// ── Extract first video frame ─────────────────────────────────────────────────
function extractVideoFrame(file) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const url   = URL.createObjectURL(file);

        video.preload  = 'metadata';
        video.muted    = true;
        video.src      = url;

        video.onloadeddata = () => {
            video.currentTime = 0.5; // seek slightly in for a better frame
        };

        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            let w = video.videoWidth;
            let h = video.videoHeight;
            if (w > THUMB_MAX_PX || h > THUMB_MAX_PX) {
                const r = THUMB_MAX_PX / Math.max(w, h);
                w = Math.round(w * r);
                h = Math.round(h * r);
            }
            canvas.width  = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(video, 0, 0, w, h);
            const dataURL = canvas.toDataURL('image/jpeg', 0.6);
            pendingMeta.duration = formatDuration(video.duration);
            URL.revokeObjectURL(url);
            video.src = '';
            resolve({ dataURL, width: w, height: h, type: 'image/jpeg', isVideoThumb: true });
        };

        video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Video load failed')); };
        // Timeout fallback — some browsers can't seek
        setTimeout(() => {
            if (!pendingThumb) {
                URL.revokeObjectURL(url);
                reject(new Error('Video frame timeout'));
            }
        }, 5000);
    });
}

// ── Get audio duration ────────────────────────────────────────────────────────
function getAudioDuration(file) {
    return new Promise((resolve) => {
        const audio = document.createElement('audio');
        const url   = URL.createObjectURL(file);
        audio.preload = 'metadata';
        audio.onloadedmetadata = () => {
            const dur = formatDuration(audio.duration);
            URL.revokeObjectURL(url);
            audio.src = '';
            resolve(dur);
        };
        audio.onerror = () => { URL.revokeObjectURL(url); resolve(''); };
        audio.src = url;
    });
}

// ── Show popup ────────────────────────────────────────────────────────────────
function showPopupLoading() {
    const popup = document.getElementById('media-pop');
    if (!popup) return;
    popup.style.display = 'flex';
    document.getElementById('pop-img')?.setAttribute('style', 'display:none');
    document.getElementById('pop-vid')?.setAttribute('style', 'display:none');
    document.getElementById('pop-aud')?.setAttribute('style', 'display:none');
    document.getElementById('pop-file')?.setAttribute('style', 'display:none');
    const btn = document.getElementById('upload-confirm-btn');
    if (btn) { btn.textContent = 'Processing…'; btn.disabled = true; }
}

function showPopupPreview() {
    if (!pendingMeta) return;
    const { fileType, fileName, fileSize, duration } = pendingMeta;
    const isImage = fileType?.startsWith('image/');
    const isVideo = fileType?.startsWith('video/');
    const isAudio = fileType?.startsWith('audio/');

    // Hide all slots
    ['pop-img','pop-vid','pop-aud','pop-file'].forEach(id =>
        document.getElementById(id)?.setAttribute('style','display:none')
    );

    if ((isImage || isVideo) && pendingThumb) {
        const imgEl = document.getElementById('pop-img');
        if (imgEl) {
            imgEl.src = pendingThumb.dataURL;
            imgEl.style.display = 'block';
            // Show video overlay badge on thumbnail
            if (isVideo) imgEl.style.opacity = '0.85';
        }
    }

    const fileEl = document.getElementById('pop-file');
    if (fileEl) {
        const icon = isImage ? '🖼️'
                   : isVideo ? '🎬'
                   : isAudio ? '🎵'
                   : (FILE_ICONS[fileType] || FILE_ICONS.default);

        const sizeStr = formatBytes(fileSize);
        const durStr  = duration ? ` · ${duration}` : '';
        const thumb   = pendingThumb?.dataURL;

        fileEl.innerHTML = `
            <div class="file-card-preview">
                ${thumb ? `<img src="${thumb}" class="file-card-thumb" alt="preview">` : `<span class="file-card-icon">${icon}</span>`}
                <div class="file-card-info">
                    <span class="file-card-name">${esc(fileName)}</span>
                    <span class="file-card-meta">${sizeStr}${durStr}</span>
                    <span class="file-card-badge">${isImage?'Image':isVideo?'Video':isAudio?'Audio':'File'} · instant send</span>
                </div>
            </div>
        `;
        fileEl.style.display = 'block';
    }

    const caption = document.getElementById('pop-caption');
    if (caption) caption.value = document.getElementById('m-in')?.value || '';

    // Re-enable button
    const btn = document.getElementById('upload-confirm-btn');
    if (btn) { btn.textContent = 'Send Instantly ⚡'; btn.disabled = false; }
}

// ── Cancel ────────────────────────────────────────────────────────────────────
window.cancelUpload = () => {
    pendingFile = pendingThumb = pendingMeta = null;
    window._pendingFile = null;
    const popup = document.getElementById('media-pop');
    if (popup) popup.style.display = 'none';
    const img = document.getElementById('pop-img');
    if (img) { img.src = ''; img.style.display = 'none'; }
};

// ── Confirm send (NO Firebase Storage — direct to Firestore) ─────────────────
window.confirmUpload = async () => {
    if (!pendingMeta) return;

    const btn = document.getElementById('upload-confirm-btn');
    if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }

    try {
        const user    = currentUser();
        const caption = document.getElementById('pop-caption')?.value.trim() || '';
        const { fileName, fileSize, fileType, duration } = pendingMeta;
        const isImage = fileType?.startsWith('image/');
        const isVideo = fileType?.startsWith('video/');
        const isAudio = fileType?.startsWith('audio/');

        // Build the message payload — thumbnail goes straight into Firestore
        const payload = {
            user,
            userColor:    getUserColor(user),
            text:         caption,
            parentId:     null,
            replyPreview: null,
            createdAt:    serverTimestamp(),
            deleted:      false,
            edited:       false,
            // File card fields
            fileCard: true,
            fileName,
            fileSize,
            fileType,
            fileIcon:     isImage ? '🖼️' : isVideo ? '🎬' : isAudio ? '🎵' : (FILE_ICONS[fileType] || FILE_ICONS.default),
            fileThumb:    pendingThumb?.dataURL || null,   // compressed base64 or null
            fileDuration: duration || null,
        };

        await addDoc(collection(window.db, 'messages'), payload);

        // Clear input caption
        const mIn = document.getElementById('m-in');
        if (mIn && mIn.value === caption) mIn.value = '';

        window.cancelUpload();
    } catch (err) {
        console.error('Send error:', err);
        if (err.code === 'resource-exhausted' || (err.message && err.message.includes('exceeds'))) {
            alert('❌ File thumbnail too large for Firestore.\nTry a smaller image.');
        } else {
            alert('❌ Failed to send. Check your connection.');
        }
        if (btn) { btn.textContent = 'Send Instantly ⚡'; btn.disabled = false; }
    }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(b) {
    if (b < 1024)        return `${b} B`;
    if (b < 1_048_576)   return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1_048_576).toFixed(1)} MB`;
}

function formatDuration(secs) {
    if (!secs || !isFinite(secs)) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

console.log('✅ File upload module loaded (instant / no Storage)');
