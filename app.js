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

// BOOT SYSTEM - YOUR ORIGINAL (KEPT EXACTLY)
window.boot = (m) => {
    engineMode = m;
    document.getElementById('gate').style.transform = 'translateY(-100%)';
    startEngine();
};

// IMAGE UPLOAD WITH PREVIEW
const fIn = document.getElementById('f-in');
fIn.onchange = (e) => {
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

// YOUTUBE-STYLE MESSAGE ENGINE WITH NESTED REPLIES
function startEngine() {
    const lim = engineMode === 'LITE' ? 20 : engineMode === 'SMART' ? 50 : 100;
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

    onSnapshot(collection(db, "stats"), (s) => {
        if (!s.empty) {
            document.getElementById('w-val').innerText = s.docs[0].data().count || 0;
        }
    });
}

// RENDER MESSAGE WITH NESTED REPLIES (YouTube-style)
function renderMessage(msgId, data, depth = 0) {
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

    if (data.replyingToText) {
        const replyIndicator = document.createElement('div');
        replyIndicator.className = 'reply-indicator';
        replyIndicator.innerHTML = `<strong>↳</strong> "${data.replyingToText.substring(0, 50)}${data.replyingToText.length > 50 ? '...' : ''}"`;
        bubble.appendChild(replyIndicator);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (data.txt) {
        const textSpan = document.createElement('span');
        textSpan.textContent = data.txt;
        contentDiv.appendChild(textSpan);
    }

    if (data.file) {
        const fileType = data.fileType || '';
        if (fileType.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = data.file;
            img.className = 'message-image';
            img.onclick = () => window.open(data.file);
            contentDiv.appendChild(img);
        } else if (fileType.startsWith('video/')) {
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
        <button class="action-btn" onclick="replyToMessage('${msgId}', '${escapeQuotes(data.txt || 'Image')}')">↩️</button>
        ${isMy ? `<button class="action-btn delete-btn" onclick="deleteMessage('${msgId}')">🗑️</button>` : ''}
    `;
    bubble.appendChild(actions);
    
    container.appendChild(bubble);

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
    if (!input.value.trim() && !fileToUpload) return;

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

window.hideSidebar = () => {
    document.getElementById('side').classList.remove('open');
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
