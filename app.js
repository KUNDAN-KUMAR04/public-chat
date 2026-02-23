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

// GLOBAL STATE
let engineMode = 'MAX';
let replyingToId = null;
let replyingToText = null;
let fileToUpload = null;

// FEATURE ACCESS LEVELS
const FEATURES = {
    MAX: { text: true, images: true, videos: true, pdfs: true, replies: true, pin: true, emojis: true, msgLimit: 100 },
    SMART: { text: true, images: true, videos: false, pdfs: false, replies: true, pin: true, emojis: true, msgLimit: 50 },
    LITE: { text: true, images: false, videos: false, pdfs: false, replies: true, pin: true, emojis: true, msgLimit: 20 }
};

// BOOT SYSTEM
window.boot = (m) => {
    engineMode = m;
    console.log(`🚀 Boot: ${m} level selected`);
    
    // Hide/show upload button based on level
    updateFeatureUI();
    
    // Slide gate up
    const gate = document.getElementById('gate');
    if (gate) {
        gate.style.transform = 'translateY(-100%)';
    }
    
    // Start engine
    startEngine();
};

// UPDATE UI BASED ON LEVEL
function updateFeatureUI() {
    const features = FEATURES[engineMode];
    const uploadBtn = document.querySelector('label[style*="📎"]');
    
    if (uploadBtn) {
        // Hide upload for SMART and LITE
        if (engineMode === 'SMART' || engineMode === 'LITE') {
            uploadBtn.style.display = 'none';
        } else {
            uploadBtn.style.display = 'inline-block';
        }
    }
    
    // Log current level
    console.log(`📱 Features enabled for ${engineMode}:`, features);
}

// FILE UPLOAD - WITH LEVEL CHECK
const fIn = document.getElementById('f-in');
if (fIn) {
    fIn.onchange = (e) => {
        const features = FEATURES[engineMode];
        
        // Block upload for LITE and SMART
        if (!features.images) {
            alert(`❌ Image uploads not available in ${engineMode} mode\n\nSwitch to MAX to upload images`);
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

// MESSAGE ENGINE
function startEngine() {
    const features = FEATURES[engineMode];
    const lim = features.msgLimit;
    
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
            const data = doc.data();
            const msgElement = renderMessage(doc.id, data, 0);
            chat.appendChild(msgElement);
        });
        
        chat.scrollTop = chat.scrollHeight;
    });

    // Wipe counter
    onSnapshot(collection(db, "stats"), (s) => {
        if (!s.empty) {
            document.getElementById('w-val').innerText = s.docs[0].data().count || 0;
        }
    });
}

// RENDER MESSAGE WITH LEVEL-SPECIFIC FEATURES
function renderMessage(msgId, data, depth = 0) {
    const features = FEATURES[engineMode];
    const container = document.createElement('div');
    container.className = `message-container depth-${Math.min(depth, 3)}`;
    container.id = `msg-${msgId}`;

    const isMy = data.user === (document.getElementById('u-in').value || "Guest");
    
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isMy ? 'my-message' : 'other-message'}`;
    
    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = `
        <span class="user-name">${data.user}</span>
        <span class="timestamp">${formatTime(data.createdAt)}</span>
    `;
    bubble.appendChild(header);

    // Reply indicator
    if (data.replyingToText) {
        const replyIndicator = document.createElement('div');
        replyIndicator.className = 'reply-indicator';
        replyIndicator.innerHTML = `<strong>↳</strong> "${data.replyingToText.substring(0, 50)}${data.replyingToText.length > 50 ? '...' : ''}"`;
        bubble.appendChild(replyIndicator);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Text content (always shown)
    if (data.txt) {
        const textSpan = document.createElement('span');
        textSpan.textContent = data.txt;
        contentDiv.appendChild(textSpan);
    }

    // File content - RESPECTS LEVEL
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

    // Action buttons - Reply always available
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.innerHTML = `
        <button class="action-btn" onclick="replyToMessage('${msgId}', '${escapeQuotes(data.txt || 'Message')}')">↩️</button>
        ${features.pin ? `<button class="action-btn" onclick="pinMessage('${msgId}')">📌</button>` : ''}
        ${isMy ? `<button class="action-btn delete-btn" onclick="deleteMessage('${msgId}')">🗑️</button>` : ''}
    `;
    bubble.appendChild(actions);
    
    container.appendChild(bubble);

    // Load nested replies
    const repliesQuery = query(
        collection(db, "messages"),
        where('replyingToId', '==', msgId)
    );

    onSnapshot(repliesQuery, (snapshot) => {
        let repliesContainer = container.querySelector('.replies-container');
        if (!repliesContainer) {
            repliesContainer = document.createElement('div');
            repliesContainer.className = 'replies-container';
            container.appendChild(repliesContainer);
        }
        
        repliesContainer.innerHTML = '';
        snapshot.docs.forEach((replyDoc) => {
            const replyData = replyDoc.data();
            const replyElement = renderMessage(replyDoc.id, replyData, depth + 1);
            repliesContainer.appendChild(replyElement);
        });
    });

    return container;
}

window.replyToMessage = (msgId, msgText) => {
    const features = FEATURES[engineMode];
    if (!features.replies) {
        alert(`❌ Replies not available in ${engineMode} mode`);
        return;
    }
    
    replyingToId = msgId;
    replyingToText = msgText;
    const rTag = document.getElementById('r-tag');
    rTag.innerHTML = `
        <div class="reply-tag-content">
            <span class="reply-label">↩️ Replying to:</span>
            <span class="reply-text">"${msgText.substring(0, 60)}${msgText.length > 60 ? '...' : ''}"</span>
            <button class="close-reply" onclick="window.cancelReply()">✕</button>
        </div>
    `;
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
    // Can be extended with Firebase
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
    if (!confirm("🚨 Delete ALL messages forever?")) return;
    
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

// Enter key to send
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

console.log('✅ App loaded - Select a level to start');
