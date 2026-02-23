# 🌍 ULTRA MAX GLOBAL — Setup Guide v3.0

## ✨ What's New in v3.0

| Feature | Status |
|---|---|
| 😊 Reactions (👍❤️😂 etc.) | ✅ New |
| ✏️ Edit messages | ✅ New |
| ⌨️ Typing indicator | ✅ New |
| 👁️ Read receipts | ✅ New |
| 🔍 Message search (Ctrl+F) | ✅ New |
| 🌙 Dark mode toggle | ✅ New |
| 🎨 User color customization | ✅ New |
| 🌳 Improved reply tree | ✅ Improved |
| 📁 All file types (video/audio/pdf/zip…) | ✅ Improved |
| 👥 Real cross-device online count | ✅ Fixed |
| 🗑️ Wipe system (broken import fixed) | ✅ Fixed |
| 📌 Sidebar outside-click-to-close | ✅ Fixed |
| ⚠️ config.js placeholder | ✅ Added |
| 🏗️ Clean module architecture | ✅ Improved |

---

## 🚀 Quick Start

### Step 1 — Fill in `config.js`
```js
export const firebaseConfig = {
    apiKey:            "YOUR_REAL_API_KEY",
    authDomain:        "YOUR_PROJECT.firebaseapp.com",
    projectId:         "YOUR_PROJECT_ID",
    storageBucket:     "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId:             "YOUR_APP_ID"
};
```
Get these from: **Firebase Console → Your Project → Project Settings → Your Apps**

### Step 2 — Firestore Security Rules
In Firebase Console → Firestore → Rules, paste:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /messages/{doc}  { allow read, write: if true; }
    match /pins/{doc}      { allow read, write: if true; }
    match /stats/{doc}     { allow read, write: if true; }
    match /presence/{doc}  { allow read, write: if true; }
    match /typing/{doc}    { allow read, write: if true; }
  }
}
```
*(Tighten these with auth rules when you're ready)*

### Step 3 — Storage Rules
In Firebase Console → Storage → Rules:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /media/{allPaths=**} {
      allow read: if true;
      allow write: if request.resource.size < 52428800; // 50MB max
    }
  }
}
```

### Step 4 — Deploy
Upload all files to **GitHub Pages**, **Vercel**, or **Firebase Hosting**.

### Step 5 — Hard refresh
`Ctrl + Shift + R` (or `Cmd + Shift + R` on Mac)

---

## 📁 File Structure

```
📄 index.html           Main HTML — clean, semantic
📄 config.js            ⚠️ Your Firebase credentials (never commit!)
📄 style.css            All styles, CSS variables, dark mode
📄 manifest.json        PWA config
📄 sw.js                Service worker (offline/caching)

🔧 CORE MODULES:
  core.js               Firebase init, boot, FEATURES config
  app.js                Entry point — imports all modules in order

💬 FEATURE MODULES:
  messages.js           Send/receive/edit/delete, reply tree
  file-upload.js        All file types with progress bar
  reactions.js          Emoji reactions on messages
  typing-indicator.js   "X is typing…" via Firestore
  read-receipts.js      Seen status via IntersectionObserver
  message-search.js     Full-text search (Ctrl+F)
  dark-mode.js          Dark/light toggle + system preference
  user-colors.js        Color picker per username
  active-users.js       Real cross-device presence (Firestore)
  special-box.js        Sidebar, pinning, outside-click-close
  wipe-system.js        Wipe chat + counter (fixed import bug)
  emoji-support.js      Font stack for emoji rendering
```

---

## 🎮 Features Guide

### Reactions
- Hover a message → click 😊 button → pick emoji
- Click a reaction pill to toggle your reaction
- One reaction per user per message

### Edit Messages
- Hover your own message → click ✏️
- Input bar shows orange "Editing" tag
- Press Enter or ✔ to save, Escape to cancel

### Typing Indicator
- Automatically shows when you type
- Clears 3 seconds after you stop typing
- Shows up to 3 names: "Alice, Bob are typing…"

### Message Search
- Click 🔍 in nav or press `Ctrl+F` / `Cmd+F`
- Searches message text and usernames
- Click result to scroll to that message

### Dark Mode
- Click ☀️/🌙 button in nav
- Automatically follows system preference on first load
- Your choice is remembered

### User Colors
- Click the colored dot next to your username input
- Pick from 12 presets or use custom color picker
- Your color shows on your avatar and username

### Reply Tree
- Click ↩ on any message to reply to it
- Replies nest visually up to 4 levels deep
- Click a reply quote to scroll to the original

### File Uploads
- Click 📎 to attach files
- MAX mode: images, video, audio, PDF, docs, zip (up to 50MB)
- SMART mode: images, video, audio, PDF
- LITE mode: images only
- Preview before sending with optional caption

### Read Receipts
- Messages you send show "👁 Seen by X" when others read them
- Based on IntersectionObserver (no polling)

---

## 🔧 Adding New Features

```js
// 1. Create my-feature.js
class MyFeature {
    constructor() {
        this.init();
    }
    init() {
        window.addEventListener('engine-booted', ({ detail }) => {
            console.log('My feature started in', detail.mode);
        });
    }
}
window.myFeature = new MyFeature();
export default window.myFeature;

// 2. Add to app.js
import './my-feature.js';
```

---

## 🔥 Firestore Collections

| Collection | Purpose |
|---|---|
| `messages` | All chat messages |
| `pins` | Pinned messages |
| `stats` | Wipe counter (`stats/global`) |
| `presence` | Online users (real-time) |
| `typing` | Typing indicators |

---

## 🐛 Troubleshooting

**App crashes on load?**
→ Check `config.js` has your real Firebase values

**Messages not sending?**
→ Check Firestore rules allow write access
→ Open browser console (F12) for errors

**Files not uploading?**
→ Check Firebase Storage rules
→ Verify Storage bucket name in `config.js`

**Reactions/typing not working?**
→ Add `presence` and `typing` collections to Firestore rules

**Active users always shows 1?**
→ Now uses Firestore — make sure `presence` collection is allowed

**Hard refresh:** `Ctrl+Shift+R` clears service worker cache
