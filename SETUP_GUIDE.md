# 🌍 ULTRA MAX GLOBAL — Setup Guide v3.1

## ✅ Firestore Rules Compatibility

This build is fully compatible with these exact rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /messages/{msg} {
      allow read, create, update: if true;
      allow delete: if false;  // Only Admin Dashboard can delete
    }
    match /pinned/{pin} { allow read: if true; }
    match /admin/stats  { allow read: if true; }
  }
}
```

### How each module adapts to your rules:

| Feature | Collection | How it works |
|---|---|---|
| Messages | `/messages` | Send=`addDoc`, Edit=`updateDoc`, "Delete"=`updateDoc {deleted:true}` |
| Pinned messages | `/pinned` | Pin=`addDoc`, Unpin=`updateDoc {hidden:true}` (no deleteDoc!) |
| Wipe counter display | `/admin/stats` | Read-only via `onSnapshot`. Increment done by your Admin Dashboard |
| Wipe chat | `/messages` | Soft-wipe: `updateDoc {deleted:true}` on all messages |
| Reactions | `/messages` | `updateDoc {reactions:{...}}` — works within update rule |
| Read receipts | `/messages` | `updateDoc {seenBy:[...]}` — works within update rule |
| Typing indicator | none | Uses **BroadcastChannel + localStorage** (no Firestore needed) |
| Active users | none | Uses **BroadcastChannel + localStorage** (no Firestore needed) |

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

### Step 2 — Firebase Storage Rules
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

### Step 3 — Create Firestore Documents
Your rules reference `admin/stats`. Create it manually in the Firebase Console:
- Collection: `admin`
- Document ID: `stats`
- Fields: `wipes: 0`, `count: 0`

### Step 4 — Deploy all files
Upload to GitHub Pages, Vercel, or Firebase Hosting.

### Step 5 — Hard refresh
`Ctrl + Shift + R`

---

## 📁 File Structure

```
📄 index.html              Main HTML
📄 config.js               ⚠️ Your Firebase credentials (never commit!)
📄 style.css               All styles + dark mode CSS variables
📄 manifest.json           PWA config
📄 sw.js                   Service worker (offline/caching)

🔧 MODULES:
  app.js                   Entry point — imports all modules
  core.js                  Firebase init, boot, FEATURES config
  messages.js              Send/receive/edit/soft-delete, reply tree
  file-upload.js           All file types, progress bar
  reactions.js             Emoji reactions (stored in message doc)
  read-receipts.js         Seen status (stored in message doc)
  message-search.js        Full-text search, Ctrl+F shortcut
  dark-mode.js             Dark/light toggle + system preference
  user-colors.js           Per-user color picker
  active-users.js          Cross-tab counter via BroadcastChannel
  typing-indicator.js      Cross-tab "typing…" via BroadcastChannel
  special-box.js           Sidebar, pin/unpin (collection: "pinned")
  wipe-system.js           Soft-wipe via updateDoc, reads admin/stats
  emoji-support.js         Font stack for emoji rendering
```

---

## 🎮 Features

### Message "Delete"
- Your rules set `allow delete: if false`
- So "delete" = soft-delete: `{deleted:true, text:'', fileURL:null}`
- The message stays in Firestore but renders as *"This message was deleted"*
- Your Admin Dashboard can hard-delete if needed

### Wipe Counter
- Display reads from `admin/stats` (read-only per rules)
- The counter number is incremented by your **Admin Dashboard** only
- The Wipe button soft-deletes all messages (`updateDoc`) — it does NOT write to `admin/stats`

### Pinned Messages
- Stored in `/pinned` collection (read allowed by rules)
- "Unpin" sets `{hidden:true}` via `updateDoc` — no deleteDoc needed
- The query filters `where('hidden', '==', false)` automatically

### Typing & Online Count
- Work across multiple tabs on the **same browser/device** via BroadcastChannel
- For **cross-device** indicators, add these to your Firestore rules:
  ```
  match /typing/{doc}   { allow read, write: if true; }
  match /presence/{doc} { allow read, write: if true; }
  ```
  Then use the Firestore versions from the v3.0 release.

---

## 🐛 Troubleshooting

**"Missing or insufficient permissions" error?**
→ Check your Firestore rules allow `read, create, update` on `/messages`
→ Check `/pinned` allows `read` (the app only reads pinned)
→ Check `/admin/stats` allows `read`

**Wipe counter not showing?**
→ Make sure `admin/stats` document exists in Firestore Console
→ Create it manually: Collection=`admin`, Doc=`stats`, field `wipes=0`

**Pinned messages not loading?**
→ The `/pinned` query uses `where('hidden', '==', false)` — you need a Firestore composite index
→ Firebase Console will show a link to create it automatically when the query first runs

**Messages not deleting visually?**
→ They soft-delete: `deleted:true` renders as "This message was deleted"
→ Hard delete requires Admin Dashboard (rules block client-side delete)
