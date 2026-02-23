import { firebaseConfig } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, 
    serverTimestamp, deleteDoc, getDocs, doc, updateDoc, where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytes, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const st = getStorage(app);

let engineMode = 'MAX';
let replyingToId = null;
let replyingToText = null;
let fileToUpload = null;

const FEATURES = {
    MAX: { text: true, images: true, videos: true, pdfs: true, replies: true, pin: true, emojis: true, msgLimit: 100 },
    SMART: { text: true, images: true, videos: false, pdfs: false, replies: true, pin: true, emojis: true, msgLimit: 50 },
    LITE: { text: true, images: false, videos: false, pdfs: false, replies: true, pin: true, emojis: true, msgLimit: 20 }
};

// BOOT - User selects level from gate
window.boot = (m) => {
    engineMode = m;
    console.log(`🚀 Boot: ${m} level selected`);
    updateLevelButton();
    updateFeatureUI();
    
    const gate = document.getElementById('gate');
    if (gate) gate.style.transform = 'translateY(-100%)';
    
    startEngine();
};

// SWITCH LEVEL - Click button to go back to gate
window.switchLevel = () => {
    const gate = document.getElementById('gate');
    if (gate) gate.style.transform = 'translateY(0)';
    const chat = document.getElementById('chat');
    if (chat) chat.innerHTML = '';
};

// UPDATE BUTTON WITH CURRENT LEVEL
function updateLevelButton() {
    const btn = document.getElementById('level-btn');
    if (!btn) return;
    const icons = { MAX: '💎', SMART: '📱', LITE: '⚡' };
    btn.innerHTML = `${icons[engineMode]} ${engineMode}`;
    btn.onclick = () => window.switchLevel();
}

function updateFeatureUI() {
    const uploadBtn = document.querySelector('label[style*="📎"]');
    if (uploadBtn) {
        uploadBtn.style.display = (engineMode === 'MAX' ? 'inline-block' : 'none');
    }
    console.log(`📱 Features for ${engineMode}:`, FEATURES[engineMode]);
}

const fIn = document.getElementById('f-in');
if (fIn) {
    fIn.onchange = (e) => {
        if (!FEATURES[engineMode].images) {
            alert(`❌ No image upload in ${engineMode} mode\n\nSwitch to MAX to upload`);
            e.target.value = '';
            return;
        }
        
        const file = e.target.files[0];
        if (!file) return;
        
        fileToUpload = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('pop-img').src = ev.target.result;
            document.getElementById('media-pop').style.display = 'flex';
        };
        reader.readAsDataURL(file);
    };
}

window.cancelUpload = () => {
    fileToUpload = null;
    document.getElementById('media-pop').style.display = 'none';
    document.getElementById('f-in').value = '';
};

window.confirmUpload = async () => {
    const btn = document.getElementById('upload-confirm-btn');
    btn.innerText = "Uploading...";
    btn.disabled = true;

    try {
        const sRef = ref(st, `media/${Date.now()}_${fileToUpload.name}`);
        await uploadBytes(sRef, fileToUpload);
        const url = await getDownloadURL(sRef);

        await addDoc(collection(db, "messages"), {
            user: document.getElementById('u-in').value || "Guest",
            txt: document.getElementById('m-in').value || "",
            file: url,
            fileType: fileToUpload.type,
            createdAt: serverTimestamp(),
            replyingToId: replyingToId,
            replyingToText: replyingToText
        });

        document.getElementById('m-in').value = "";
        btn.innerText = "Send";
        btn.disabled = false;
        window.cancelUpload();
        window.cancelReply();
    } catch (error) {
        console.error('Upload error:', error);
        btn.innerText = "Send";
        btn.disabled = false;
        alert('Upload failed');
    }
};

function startEngine() {
    const lim = FEATURES[engineMode].msgLimit;
    
    const q = query(
        collection(db, "messages"), 
        where('replyingToId', '==', null),
        orderBy("createdAt", "desc"), 
        limit(lim)
    );

    onSnapshot(q, (snap) => {
        const chat = document.getElementById('chat');
        chat.innerHTML = "";
        snap.docs.reverse().forEach((doc) => {
            const msgElement = renderMessage(doc.id, doc.data(), 0);
            chat.appendChild(msgElement);
        });
        chat.scrollTop = chat.scrollHeight;
    });

    onSnapshot(collection(db, "stats"), (s) => {
        if (!s.empty) {
            document.getElementById('w-val').innerText = s.docs[0].data().count || 0;
        }
    });
}

function renderMessage(msgId, data, depth = 0) {
    const features = FEATURES[engineMode];
    const container = document.createElement('div');
    container.className = `message-container depth-${Math.min(depth, 3)}`;

    const isMy = data.user === (document.getElementById('u-in').value || "Guest");
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isMy ? 'my-message' : 'other-message'}`;
    
    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = `<span class="user-name">${data.user}</span><span class="timestamp">${formatTime(data.createdAt)}</span>`;
    bubble.appendChild(header);

    if (data.replyingToText) {
        const replyIndicator = document.createElement('div');
        replyIndicator.className = 'reply-indicator';
        replyIndicator.innerHTML = `<strong>↳</strong> "${data.replyingToText.substring(0, 50)}..."`;
        bubble.appendChild(replyIndicator);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (data.txt) {
        const textSpan = document.createElement('span');
        textSpan.textContent = data.txt;
        contentDiv.appendChild(textSpan);
    }

    if (data.file && features.images) {
        const fileType = data.fileType || '';
        if (fileType.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = data.file;
            img.className = 'message-image';
            img.onclick = () => window.open(data.file);
            contentDiv.appendChild(img);
        } else if (fileType.startsWith('video/') && features.videos) {
            const video = document.createElement('video');
            video.src = data.file;
            video.controls = true;
            video.className = 'message-video';
            contentDiv.appendChild(video);
        }
    }
    
    bubble.appendChild(contentDiv);

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
        <button class="action-btn" onclick="replyToMessage('${msgId}', '${escapeQuotes(data.txt || 'Message')}')">↩️</button>
        ${features.pin ? `<button class="action-btn" onclick="pinMessage('${msgId}')">📌</button>` : ''}
        ${isMy ? `<button class="action-btn delete-btn" onclick="deleteMessage('${msgId}')">🗑️</button>` : ''}
    `;
    bubble.appendChild(actions);
    container.appendChild(bubble);

    const repliesQuery = query(collection(db, "messages"), where('replyingToId', '==', msgId));
    onSnapshot(repliesQuery, (snapshot) => {
        let repliesContainer = container.querySelector('.replies-container');
        if (!repliesContainer) {
            repliesContainer = document.createElement('div');
            repliesContainer.className = 'replies-container';
            container.appendChild(repliesContainer);
        }
        repliesContainer.innerHTML = '';
        snapshot.docs.forEach((replyDoc) => {
            const replyElement = renderMessage(replyDoc.id, replyDoc.data(), depth + 1);
            repliesContainer.appendChild(replyElement);
        });
    });

    return container;
}

window.replyToMessage = (msgId, msgText) => {
    if (!FEATURES[engineMode].replies) {
        alert(`❌ Replies not in ${engineMode} mode`);
        return;
    }
    replyingToId = msgId;
    replyingToText = msgText;
    const rTag = document.getElementById('r-tag');
    rTag.innerHTML = `<div class="reply-tag-content"><span class="reply-label">↩️ Replying to:</span><span class="reply-text">"${msgText.substring(0, 60)}..."</span><button class="close-reply" onclick="window.cancelReply()">✕</button></div>`;
    rTag.style.display = 'block';
    document.getElementById('m-in').focus();
};

window.cancelReply = () => {
    replyingToId = null;
    replyingToText = null;
    document.getElementById('r-tag').style.display = 'none';
};

window.sendMessage = async () => {
    const input = document.getElementById('m-in');
    if (!input.value.trim()) return;

    try {
        await addDoc(collection(db, "messages"), {
            user: document.getElementById('u-in').value || "Guest",
            txt: input.value,
            createdAt: serverTimestamp(),
            replyingToId: replyingToId,
            replyingToText: replyingToText
        });
        input.value = "";
        window.cancelReply();
    } catch (error) {
        console.error('Send error:', error);
    }
};

window.pinMessage = (msgId) => {
    console.log(`📌 Pinned: ${msgId}`);
};

window.deleteMessage = async (msgId) => {
    if (!confirm('Delete this message?')) return;
    try {
        await deleteDoc(doc(db, "messages", msgId));
    } catch (error) {
        console.error('Delete error:', error);
    }
};

window.wipeAllData = async () => {
    if (!confirm("🚨 Delete ALL messages?")) return;
    try {
        const snap = await getDocs(collection(db, "messages"));
        snap.forEach(async (d) => await deleteDoc(d.ref));
        
        const statsSnap = await getDocs(collection(db, "stats"));
        if (!statsSnap.empty) {
            const cur = statsSnap.docs[0].data().count || 0;
            await updateDoc(statsSnap.docs[0].ref, { count: cur + 1 });
        }
        alert('✓ Wiped');
    } catch (error) {
        console.error('Wipe error:', error);
    }
};

window.toggleSidebar = () => {
    document.getElementById('side').classList.toggle('open');
};

function escapeQuotes(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('m-in');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                window.sendMessage();
            }
        });
    }
});

console.log('✅ App ready - Click a level to start!');
