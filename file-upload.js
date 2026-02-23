/**
 * 📁 FILE UPLOAD FEATURE
 * Upload files with loading indicator
 * Preview before sending
 * EVERYTHING about file uploads in ONE file
 */

import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

class FileUploadFeature {
    constructor() {
        this.fileToUpload = null;
        this.init();
    }

    init() {
        this.setupFileInput();
        this.setupLoadingIndicator();
        this.setupPopupHandlers();
    }

    setupFileInput() {
        const fIn = document.getElementById('f-in');
        if (fIn) {
            fIn.addEventListener('change', (e) => this.handleFileSelect(e));
        }
    }

    setupLoadingIndicator() {
        // Create loading indicator
        const html = `
            <div id="loading-overlay" style="display:none;">
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p id="loading-text">Uploading...</p>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        // Listen for loading events
        window.addEventListener('start-loading', (e) => {
            this.showLoading(e.detail.text || 'Loading...');
        });

        window.addEventListener('stop-loading', () => {
            this.hideLoading();
        });
    }

    setupPopupHandlers() {
        const cancelBtn = document.getElementById('cancel-btn') || 
            document.querySelector('[onclick*="cancelUpload"]');
        const confirmBtn = document.getElementById('upload-confirm-btn');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.confirmUpload());
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.cancelUpload());
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        this.fileToUpload = file;
        const reader = new FileReader();
        
        reader.onload = (ev) => {
            const popImg = document.getElementById('pop-img');
            if (popImg) {
                popImg.src = ev.target.result;
            }
            const mediaPop = document.getElementById('media-pop');
            if (mediaPop) {
                mediaPop.style.display = 'flex';
            }
        };

        reader.readAsDataURL(file);
    }

    async confirmUpload() {
        if (!this.fileToUpload) return;

        const btn = document.getElementById('upload-confirm-btn');
        if (btn) {
            btn.innerText = "Processing...";
            btn.disabled = true;
        }

        try {
            this.showLoading('Uploading file...');

            const sRef = ref(window.st, `media/${Date.now()}_${this.fileToUpload.name}`);
            await uploadBytes(sRef, this.fileToUpload);
            const url = await getDownloadURL(sRef);

            // Add message with file
            await addDoc(collection(window.db, "messages"), {
                user: document.getElementById('u-in').value || "Guest",
                file: url,
                txt: document.getElementById('m-in').value || "",
                isImg: true,
                createdAt: serverTimestamp()
            });

            document.getElementById('m-in').value = "";
            this.cancelUpload();
            this.hideLoading();
            
            if (btn) {
                btn.innerText = "Send";
                btn.disabled = false;
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.hideLoading();
            alert('Upload failed. Try again.');
            if (btn) {
                btn.innerText = "Send";
                btn.disabled = false;
            }
        }
    }

    cancelUpload() {
        this.fileToUpload = null;
        const mediaPop = document.getElementById('media-pop');
        if (mediaPop) {
            mediaPop.style.display = 'none';
        }
        const fIn = document.getElementById('f-in');
        if (fIn) {
            fIn.value = '';
        }
    }

    showLoading(text) {
        const overlay = document.getElementById('loading-overlay');
        const textEl = document.getElementById('loading-text');
        if (overlay) {
            if (textEl) textEl.textContent = text;
            overlay.style.display = 'flex';
        }
    }

    hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
}

// Initialize
window.fileUploadFeature = new FileUploadFeature();
console.log('✅ File upload module loaded');
