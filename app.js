import { firebaseConfig } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, 
    serverTimestamp, deleteDoc, getDocs, doc, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const st = getStorage(app);

let engineMode = 'MAX';
let replyTarget = null;
let replyTargetId = null;
let fileToUpload = null;
let pinnedMessages = [];

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    registerServiceWorker();
});

// SERVICE WORKER REGISTRATION
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('sw.js');
            console.log('✓ Service Worker registered');
        } catch (e) {
            console.log('Service Worker registration failed:', e);
        }
    }
}

// BOOT SYSTEM - Initialize with selected level
window.boot = (m) => {
    engineMode = m;
    document.getElementById('gate').style.opacity = '0';
    document.getElementById('gate').style.pointerEvents = 'none';
    setTimeout(() => {
        document.getElementById('gate').style.display = 'none';
    }, 500);
    startEngine();
    loadPinnedMessages();
};

// IMAGE/FILE UPLOAD WITH COMPRESSION
const fIn = document.getElementById('f-in');
fIn.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Show loading state
    document.getElementById('upload-confirm-btn').innerText = "Processing...";
    document.getElementById('upload-confirm-btn').disabled = true;

    try {
        // Compress image if needed (for MAX/SMART modes)
        let processedFile = file;
        if (file.type.startsWith('image/') && engineMode !== 'LITE') {
            processedFile = await compressImage(file);
        }

        fileToUpload = processedFile;
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('pop-img').src = ev.target.result;
            document.getElementById('media-pop').style.display = 'flex';
            document.getElementById('upload-confirm-btn').innerText = "Send";
            document.getElementById('upload-confirm-btn').disabled = false;
        };
        reader.readAsDataURL(processedFile);
    } catch (error) {
        console.error('File processing error:', error);
        alert('Error processing file. Please try again.');
        document.getElementById('upload-confirm-btn').innerText = "Send";
        document.getElementById('upload-confirm-btn').disabled = false;
    }
};

// IMAGE COMPRESSION - Reduces file size for faster upload
async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Reduce dimensions for LITE mode
                if (engineMode === 'LITE') {
                    const maxDim = 400;
                    if (width > height) {
                        height = (height * maxDim) / width;
                        width = maxDim;
                    } else {
                        width = (width * maxDim) / height;
                        height = maxDim;
                    }
                }
                // Moderate compression for SMART
                else if (engineMode === 'SMART') {
                    const maxDim = 800;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = (height * maxDim) / width;
                            width = maxDim;
                        } else {
                            width = (width * maxDim) / height;
                            height = maxDim;
                        }
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Compress quality based on mode
                const quality = engineMode === 'LITE' ? 0.5 : engineMode === 'SMART' ? 0.7 : 0.85;
                canvas.toBlob(
                    (blob) => {
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        resolve(compressedFile);
                    },
                    'image/jpeg',
                    quality
                );
            };
        };
    });
}

window.cancelUpload = () => {
    fileToUpload = null;
    document.getElementById('media-pop').style.display = 'none';
    document.getElementById('f-in').value = '';
};

window.confirmUpload = async () => {
    if (!fileToUpload) return;

    const btn = document.getElementById('upload-confirm-btn');
    btn.innerText = "Uploading...";
    btn.disabled = true;

    try {
        const sRef = ref(st, `media/${Date.now()}_${fileToUpload.name}`);
        await uploadBytes(sRef, fileToUpload);
        const url = await getDownloadURL(sRef);

        const msgInput = document.getElementById('m-in');
        await addDoc(collection(db, 'messages'), {
            user: document.getElementById('u-in').value || 'Guest',
            txt: msgInput.value || '',
            file: url,
            fileType: fileToUpload.type,
            fileName: fileToUpload.name,
            reply: replyTarget,
            replyId: replyTargetId,
            createdAt: serverTimestamp(),
            isPinned: false
        });

        msgInput.value = '';
        btn.innerText = "Send";
        btn.disabled = false;
        window.cancelUpload();
        window.cancelReply();
    } catch (error) {
        console.error('Upload error:', error);
        alert('Upload failed. Check your connection and try again.');
        btn.innerText = "Send";
        btn.disabled = false;
    }
};

// YOUTUBE LINK DETECTION & PREVIEW
function getYouTubeVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
        /youtube\.com\/embed\/([^&\n?#]+)/,
        /youtube\.com\/v\/([^&\n?#]+)/
    ];
    for (let pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

function createYouTubeCard(url) {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return null;

    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    return {
        type: 'youtube',
        videoId,
        url,
        thumbnail: thumbnailUrl
    };
}

// MESSAGE ENGINE - Render chat with proper formatting
function startEngine() {
    const lim = engineMode === 'LITE' ? 15 : engineMode === 'SMART' ? 50 : 100;
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'desc'), limit(lim));

    onSnapshot(q, (snap) => {
        const chat = document.getElementById('chat');
        chat.innerHTML = '';
        const msgs = [];

        snap.forEach(d => {
            msgs.push({ id: d.id, ...d.data() });
        });

        msgs.reverse().forEach((data) => {
            const div = document.createElement('div');
            const isMy = data.user === (document.getElementById('u-in').value || 'Guest');
            div.className = `msg ${isMy ? 'my' : 'other'}`;
            div.id = `msg-${data.id}`;

            let html = `<div class="msg-header"><b style="font-size:11px; color:var(--p);">${data.user}</b>`;
            if (data.isPinned) {
                html += `<span style="margin-left:8px; font-size:12px;">📌</span>`;
            }
            html += `</div>`;

            // Tree Reply Structure - Show who message is replying to
            if (data.reply) {
                html += `
                    <div class="tree-reply">
                        <div class="tree-line"></div>
                        <div class="reply-box">
                            <small style="color:var(--p); font-weight:bold;">↳ Reply to:</small>
                            <div class="reply-text">"${data.reply.substring(0, 60)}${data.reply.length > 60 ? '...' : ''}"</div>
                        </div>
                    </div>
                `;
            }

            // Media Rendering - Images, Videos, PDFs
            if (data.file) {
                const fileType = data.fileType || '';
                if (fileType.startsWith('image/')) {
                    html += `<img src="${data.file}" style="max-width:100%; border-radius:12px; cursor:pointer;" onclick="window.open('${data.file}')" title="Click to view full size">`;
                } else if (fileType.startsWith('video/')) {
                    html += `
                        <video style="max-width:100%; border-radius:12px; cursor:pointer;" controls>
                            <source src="${data.file}" type="${fileType}">
                            Your browser doesn't support video playback.
                        </video>
                    `;
                } else if (fileType === 'application/pdf' || data.fileName?.endsWith('.pdf')) {
                    html += `
                        <div class="pdf-preview">
                            <span style="font-size:32px;">📄</span>
                            <a href="${data.file}" target="_blank" style="color:var(--p); text-decoration:underline;">
                                ${data.fileName || 'PDF Document'}
                            </a>
                        </div>
                    `;
                } else {
                    html += `<div class="file-preview">📎 <a href="${data.file}" target="_blank">${data.fileName || 'File'}</a></div>`;
                }
            }

            // YouTube Video Embed
            const youtubeCard = data.txt ? createYouTubeCard(data.txt) : null;
            if (youtubeCard) {
                html += `
                    <div class="youtube-card">
                        <img src="${youtubeCard.thumbnail}" style="width:100%; border-radius:8px; cursor:pointer;" onclick="window.open('${youtubeCard.url}')">
                        <small style="display:block; padding:8px; text-align:center; color:#666;">🎬 YouTube Video</small>
                    </div>
                `;
            } else if (data.txt) {
                html += `<span style="word-wrap:break-word; white-space:pre-wrap;">${escapeHtml(data.txt)}</span>`;
            }

            // Action Buttons
            html += `<div class="msg-actions">
                <button class="action-btn" onclick="window.replyToMessage('${data.id}', '${escapeHtml(data.txt || 'Image/File')}')">↩️ Reply</button>
                <button class="action-btn" onclick="window.togglePin('${data.id}')">📌 Pin</button>
                ${isMy ? `<button class="action-btn danger" onclick="window.deleteMessage('${data.id}')">🗑️</button>` : ''}
            </div>`;

            div.innerHTML = html;
            chat.appendChild(div);
        });

        chat.scrollTop = chat.scrollHeight;
    });

    // Update Wipe Counter
    onSnapshot(collection(db, 'stats'), (s) => {
        if (!s.empty) {
            document.getElementById('w-val').innerText = s.docs[0].data().count || 0;
        }
    });
}

// REPLY SYSTEM
window.replyToMessage = (msgId, msgText) => {
    replyTarget = msgText;
    replyTargetId = msgId;
    const rTag = document.getElementById('r-tag');
    rTag.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
                <small style="color:var(--p); font-weight:bold;">↩️ Replying to:</small>
                <div style="font-size:13px; color:#333; margin-top:4px;">"${msgText.substring(0, 50)}${msgText.length > 50 ? '...' : ''}"</div>
            </div>
            <span onclick="window.cancelReply()" style="cursor:pointer; font-size:18px;">✕</span>
        </div>
    `;
    rTag.style.display = 'block';
};

window.cancelReply = () => {
    replyTarget = null;
    replyTargetId = null;
    document.getElementById('r-tag').style.display = 'none';
};

// SEND MESSAGE
window.sendMessage = async () => {
    const input = document.getElementById('m-in');
    const username = document.getElementById('u-in').value || 'Guest';

    if (!input.value.trim() && !fileToUpload) {
        return;
    }

    try {
        await addDoc(collection(db, 'messages'), {
            user: username,
            txt: input.value,
            reply: replyTarget,
            replyId: replyTargetId,
            createdAt: serverTimestamp(),
            isPinned: false
        });

        input.value = '';
        window.cancelReply();
    } catch (error) {
        console.error('Send error:', error);
        alert('Failed to send message. Check your connection.');
    }
};

// PINNING SYSTEM - Save important messages
window.togglePin = async (msgId) => {
    try {
        const msgRef = doc(db, 'messages', msgId);
        const snap = await getDocs(query(collection(db, 'messages')));
        
        const msgData = snap.docs.find(d => d.id === msgId);
        if (msgData) {
            await updateDoc(msgRef, {
                isPinned: !msgData.data().isPinned
            });
        }
    } catch (error) {
        console.error('Pin error:', error);
    }
};

// LOAD PINNED MESSAGES TO SIDEBAR
async function loadPinnedMessages() {
    const q = query(
        collection(db, 'messages'),
        orderBy('createdAt', 'desc')
    );

    onSnapshot(q, (snap) => {
        pinnedMessages = [];
        snap.forEach(d => {
            if (d.data().isPinned) {
                pinnedMessages.push({ id: d.id, ...d.data() });
            }
        });

        const pinList = document.getElementById('pin-list');
        pinList.innerHTML = '';

        if (pinnedMessages.length === 0) {
            pinList.innerHTML = '<p style="color:#999; text-align:center;">No pinned messages</p>';
            return;
        }

        pinnedMessages.forEach((msg) => {
            const div = document.createElement('div');
            div.className = 'pinned-item';
            div.innerHTML = `
                <div style="font-size:12px; font-weight:bold; color:var(--p);">${msg.user}</div>
                <div style="font-size:13px; color:#333; margin:4px 0;">${escapeHtml(msg.txt || 'Image/File')}</div>
                <button onclick="window.togglePin('${msg.id}')" style="font-size:11px; padding:4px 8px; background:none; border:1px solid var(--p); color:var(--p); border-radius:4px; cursor:pointer;">Unpin</button>
            `;
            pinList.appendChild(div);
        });
    });
}

// DELETE MESSAGE
window.deleteMessage = async (msgId) => {
    if (!confirm('Delete this message?')) return;

    try {
        await deleteDoc(doc(db, 'messages', msgId));
    } catch (error) {
        console.error('Delete error:', error);
    }
};

// GLOBAL WIPE
window.wipeAllData = async () => {
    if (!confirm('⚠️ SYSTEM WIPE: Delete ALL messages for everyone? This cannot be undone!')) {
        return;
    }

    try {
        const snap = await getDocs(collection(db, 'messages'));
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));

        // Increment wipe counter
        const statsRef = collection(db, 'stats');
        const statsSnap = await getDocs(statsRef);
        if (!statsSnap.empty) {
            const cur = statsSnap.docs[0].data().count || 0;
            await setDoc(statsSnap.docs[0].ref, { count: cur + 1 });
        } else {
            await addDoc(statsRef, { count: 1 });
        }

        alert('✓ Chat cleared successfully');
    } catch (error) {
        console.error('Wipe error:', error);
        alert('Wipe failed. Try again.');
    }
};

// SIDEBAR TOGGLE
window.toggleSidebar = () => {
    document.getElementById('side').classList.toggle('open');
};

// CLEAR ALL PINNED MESSAGES
window.clearAllPinned = async () => {
    if (!confirm('Clear all pinned messages?')) return;

    try {
        const q = query(collection(db, 'messages'));
        const snap = await getDocs(q);

        await Promise.all(
            snap.docs
                .filter(d => d.data().isPinned)
                .map(d => updateDoc(d.ref, { isPinned: false }))
        );

        alert('✓ All pinned messages cleared');
    } catch (error) {
        console.error('Clear pinned error:', error);
    }
};

// HIDE SIDEBAR
window.hideSidebar = () => {
    document.getElementById('side').classList.remove('open');
};

// UTILITY: Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// HANDLE ENTER KEY TO SEND
document.addEventListener('DOMContentLoaded', () => {
    const msgInput = document.getElementById('m-in');
    if (msgInput) {
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.sendMessage();
            }
        });
    }
});
