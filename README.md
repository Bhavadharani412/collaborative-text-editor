# Collaborative Text Editor

A real-time collaborative document editor inspired by modern cloud-based writing tools. Built with React, Quill, Yjs, and WebSockets for seamless multi-user editing, live presence, and document management.

---

## 🚀 Features

### ✍️ Real-Time Collaboration

* Multiple users can edit the same document simultaneously
* Changes sync instantly using Yjs CRDT
* Conflict-free concurrent editing

### 📄 Document Management

* Create new documents
* Rename documents
* Delete documents
* Persistent local document list

### 🧠 Offline Support

* IndexedDB caching for local persistence
* Reconnects and syncs when online

### 👥 Presence Awareness

* Live collaborator count
* Active typing indicator
* Shared cursor support

### 🎨 Rich Text Editing

* Bold, italic, underline, strike
* Lists and alignment
* Text colors and highlights
* Custom fonts and font sizes
* Clean toolbar interface

### 📤 Export Options

* Export as PDF
* Export as DOCX

---

## 🛠️ Tech Stack

### Frontend

* React
* React Router
* Quill Editor

### Collaboration Engine

* Yjs
* y-websocket
* y-quill
* IndexedDB

### Utilities

* html2pdf.js
* file-saver

---

## 📁 Project Structure

```text
src/
├── components/
│   ├── DocsPage.jsx
│   ├── Editor.jsx
│
├── services/
│   ├── storage.js
│   ├── yjsProvider.js
│
├── utils/
│   ├── generateId.js
```

---

## ⚙️ Installation

### 1. Clone Repository

```bash
git clone https://github.com/Bhavadharani412/collaborative-text-editor.git
cd collaborative-text-editor
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start WebSocket Server

```bash
npx y-websocket-server --port 1234
```

### 4. Start React App

```bash
npm run dev
```

---

## 🌐 Usage

1. Open app in browser
2. Create a new document
3. Open same document in multiple tabs/windows
4. Collaborate in real time

---

## 🧩 Core Modules

### `storage.js`

Handles localStorage read/write for document metadata. 

### `yjsProvider.js`

Creates Yjs document, IndexedDB persistence, and WebSocket provider. 

### `generateId.js`

Generates unique readable document IDs. 

---

## 🔄 Real-Time Sync Flow

```text
User types
↓
Quill editor change
↓
Yjs CRDT update
↓
WebSocket sync
↓
Other collaborators receive update
```

---

## 📌 Future Improvements

* Authentication
* Shareable links
* Role permissions
* Version history
* Comments system
* Cloud database persistence
* Dark mode

---

## 🏆 Why This Project Matters

This project demonstrates:

* Real-time systems engineering
* Conflict resolution using CRDT
* Rich text editor integration
* Frontend architecture with React
* Scalable collaborative product thinking

---

## 📄 License

MIT License
