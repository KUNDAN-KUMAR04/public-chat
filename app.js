import { firebaseConfig } from './config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const st = getStorage(app);

let engineMode = 'MAX';
let replyTarget = null;
let fileToUpload = null;

// BOOT SYSTEM
window.boot = (m) => {
    engineMode = m;
    document.getElementById('gate').style.transform = 'translateY(-100%)';
    startEngine();
};

// IMAGE PREVIEW POPUP LOGIC
const fIn = document.getElementById('f-in');
fIn.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
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
};

window.confirmUpload = async () => {
    const btn = document.getElementById('upload-confirm-btn');
    btn.innerText = "Processing...";
    btn.disabled = true;

    const sRef = ref(st, `media/${Date.now()}_${fileToUpload.name}`);
    await uploadBytes(sRef, fileToUpload);
    const url = await getDownloadURL(sRef);

    await addDoc(collection(db, "messages"), {
        user: document.getElementById('u-in').value || "Guest",
        file: url,
        isImg: true,
        createdAt: serverTimestamp()
    });

    btn.innerText = "Send";
    btn.disabled = false;
    window.cancelUpload();
};

// MESSAGE ENGINE
function startEngine() {
    const lim = engineMode === 'LITE' ? 20 : 100;
    const q = query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(lim));

    onSnapshot(q, (snap) => {
        const chat = document.getElementById('chat');
        chat.innerHTML = "";
        const msgs = [];
        snap.forEach(d => msgs.push({id: d.id, ...d.data()}));
        
        msgs.reverse().forEach(data => {
            const div = document.createElement('div');
            const isMy = data.user === (document.getElementById('u-in').value || "Guest");
            div.className = `msg ${isMy ? 'my' : 'other'}`;
            
            let html = `<b style="font-size:10px; color:var(--p); display:block; margin-bottom:4px;">${data.user}</b>`;
            
            // Tree Reply Structure
            if(data.reply) {
                html += `<div class="tree-container"><div class="tree-line"></div><div class="reply-preview-box">${data.reply}</div></div>`;
            }

            if(data.file) {
                html += `<img src="${data.file}" style="width:100%; border-radius:10px; cursor:pointer;" onclick="window.open('${data.file}')">`;
            } else {
                html += `<span>${data.txt || ""}</span>`;
            }

            div.innerHTML = html;
            
            // Double Click to Reply
            div.ondblclick = () => {
                replyTarget = data.txt || "Image/File";
                const rTag = document.getElementById('r-tag');
                rTag.innerHTML = `Replying to: <b>${replyTarget}</b> <span onclick="window.cancelReply()" style="float:right; cursor:pointer;">✕</span>`;
                rTag.style.display = 'block';
            };
            
            chat.appendChild(div);
        });
        chat.scrollTop = chat.scrollHeight;
    });

    // Wipe Stats Listener
    onSnapshot(collection(db, "stats"), s => {
        if(!s.empty) document.getElementById('w-val').innerText = s.docs[0].data().count || 0;
    });
}

// ACTIONS
window.sendMessage = async () => {
    const input = document.getElementById('m-in');
    if(!input.value.trim() && !fileToUpload) return;

    await addDoc(collection(db, "messages"), {
        user: document.getElementById('u-in').value || "Guest",
        txt: input.value,
        reply: replyTarget,
        createdAt: serverTimestamp()
    });

    input.value = "";
    window.cancelReply();
};

window.cancelReply = () => { replyTarget = null; document.getElementById('r-tag').style.display = 'none'; };

window.wipeAllData = async () => {
    if(!confirm("SYSTEM WIPE: Delete all messages for everyone?")) return;
    const snap = await getDocs(collection(db, "messages"));
    snap.forEach(async (d) => await deleteDoc(d.ref));
    
    // Increment Wipe Count
    const statsRef = collection(db, "stats");
    const statsSnap = await getDocs(statsRef);
    if(!statsSnap.empty) {
        const cur = statsSnap.docs[0].data().count || 0;
        await setDoc(statsSnap.docs[0].ref, { count: cur + 1 });
    }
};

window.toggleSidebar = () => document.getElementById('side').classList.toggle('open');
