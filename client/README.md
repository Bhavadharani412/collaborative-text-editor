# Client — Collaborative Docs Frontend

> React + Vite frontend for the Collaborative Docs real-time editor.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Quill](https://img.shields.io/badge/Quill-2.x-00B96B)
![Yjs](https://img.shields.io/badge/Yjs-CRDT-FF6B35)

---

## Overview

This is the browser-side application. It combines:

- **Quill v2** as the rich-text editing surface
- **Yjs** for conflict-free real-time collaborative editing (CRDT)
- **React 19 + React Router v7** for UI and routing
- **Vite 8** as the dev server and bundler

The app has two screens:

| Route | Component | Purpose |
|---|---|---|
| `/` | `DocsPage` | Document list — create, search, delete |
| `/:id` | `Editor` | Full rich-text editor for a specific document |

---

## 📁 Source Structure

```
src/
├── main.jsx               # React DOM root
│                          # ⚠ StrictMode is intentionally omitted (see Caveats)
├── App.jsx                # BrowserRouter + Routes
├── index.css              # Full design system — tokens, Quill overrides, components
│
├── components/
│   ├── DocsPage.jsx       # Home screen: document grid, search, create/delete modals
│   └── Editor.jsx         # Main editor: Quill + Yjs + toolbar + export
│
├── services/
│   ├── storage.js         # localStorage helpers: getDocs() / saveDocs()
│   └── yjsProvider.js     # Yjs stack: Y.Doc + IndexeddbPersistence + WebsocketProvider
│
└── utils/
    └── generateId.js      # Slug-style ID generator: "My Doc" → "My-Doc-1720974112345"
```

---

## 🔌 Dependencies

### Runtime

| Package | Version | Purpose |
|---|---|---|
| `react` | 19 | UI framework |
| `react-dom` | 19 | DOM renderer |
| `react-router-dom` | 7 | Client-side routing |
| `quill` | 2 | Rich-text editor engine |
| `quill-cursors` | 4 | Shared remote cursors in Quill |
| `yjs` | 13 | CRDT engine for conflict-free sync |
| `y-quill` | 1 | Quill ↔ Yjs binding |
| `y-websocket` | 3 | WebSocket provider for Yjs |
| `y-indexeddb` | 9 | IndexedDB offline persistence for Yjs |
| `html2pdf.js` | 0.14 | PDF export |
| `file-saver` | 2 | DOCX file download |

### Dev

| Package | Purpose |
|---|---|
| `vite` + `@vitejs/plugin-react` | Build tool and React HMR |
| `eslint` + plugins | Linting (react-hooks, react-refresh) |

---

## 🚀 Getting Started

```bash
# From the repository root
cd client
npm install
npm run dev
```

The app will be available at **http://localhost:5173**.

> **Prerequisite:** The Yjs WebSocket relay must be running on port 1234 for real-time collaboration to work:
> ```bash
> npx y-websocket-server --port 1234
> ```

---

## 🔧 Available Scripts

| Script | Command | Description |
|---|---|---|
| Dev server | `npm run dev` | Vite dev server with HMR at `localhost:5173` |
| Production build | `npm run build` | Outputs to `dist/` |
| Preview build | `npm run preview` | Serves the production bundle locally |
| Lint | `npm run lint` | Run ESLint across all `*.{js,jsx}` files |

---

## 🎨 Design System (`index.css`)

All styling uses a CSS custom property (token) system. Key sections:

| Section | What it covers |
|---|---|
| `:root` tokens | Colours, shadows, radii, durations, font-stack variables |
| Quill font classes | `.ql-font-<name>` — one class per supported font family |
| Quill size classes | `.ql-size-<Npt>` — 8 pt through 72 pt |
| Size picker labels | `::before` overrides with `!important` to beat Quill snow.css specificity |
| Topbar | Sticky Google Docs-style header with branding, title input, avatars |
| Editor shell | Centred paper-like container with shadow |
| DocsPage | Card grid, search bar, header |
| Modals | Create document / delete confirmation (animated, keyboard accessible) |
| Responsive | Breakpoints at 768 px and 480 px |

### Font Picker — Quill v2 Note

Quill 2.x requires importing attributors from their full paths:

```js
// ✅ Correct for Quill 2.x
const FontClass = Quill.import('attributors/class/font');
const SizeClass = Quill.import('attributors/class/size');

// ❌ Old Quill 1.x style — wrong object returned in v2
const Font = Quill.import('formats/font');
```

Using `attributors/class/size` makes Quill emit `class="ql-size-12pt"` on text spans,
which matches the `.ql-size-12pt { font-size: 12pt }` CSS rules in `index.css`.

---

## 🖥️ Supported Fonts (13 total)

Each font is loaded from Google Fonts in `index.html` and mapped to a Quill font class.

| Internal value | Display name | Category |
|---|---|---|
| `arial` | Arial | Sans-serif |
| `times-new-roman` | Times New Roman | Serif |
| `roboto` | Roboto | Sans-serif |
| `open-sans` | Open Sans | Sans-serif |
| `lato` | Lato | Sans-serif |
| `montserrat` | Montserrat | Sans-serif |
| `poppins` | Poppins | Sans-serif |
| `raleway` | Raleway | Sans-serif |
| `ubuntu` | Ubuntu | Sans-serif |
| `playfair` | Playfair Display | Display serif |
| `merriweather` | Merriweather | Serif |
| `source-code-pro` | Source Code Pro | Monospace |
| `nunito` | Nunito | Rounded sans-serif |

---

## ⚡ Font Sizes (15 total)

Sizes use **pt units** to match standard document conventions (Word, Google Docs):

`8pt · 9pt · 10pt · 11pt · 12pt · 14pt · 16pt · 18pt · 20pt · 24pt · 28pt · 32pt · 36pt · 48pt · 72pt`

---

## 🔄 Real-Time Collaboration

The collaboration stack lives in `services/yjsProvider.js`:

```
createYjs(docId)
  ├── new Y.Doc()                        — CRDT shared document
  ├── new IndexeddbPersistence(...)      — offline cache in IndexedDB
  └── new WebsocketProvider(            — connects to y-websocket relay
        "ws://localhost:1234", docId, ydoc
      )
```

In `Editor.jsx`, the `QuillBinding(ytext, quill, awareness)` keeps the Quill delta and
Yjs text in sync bidirectionally.

### Awareness fields used

| Field | Type | Purpose |
|---|---|---|
| `user` | `{ name, color }` | Collaborator identity and cursor colour |
| `selection` | Quill range | Cursor/selection position for remote cursor rendering |
| `docTitle` | `string` | Document title — broadcast when user renames the doc |

---

## ⚠️ Caveats

### No React StrictMode

`StrictMode` is **not used** in `main.jsx`. React StrictMode double-invokes `useEffect`
in development, which creates two Yjs WebSocket providers per tab (each with a unique
client ID). With two real browser tabs that becomes four awareness entries — showing
ghost collaborator avatars. Quill's imperative DOM setup also breaks under double-mount.

### Bundle Size

The production bundle is ~1.5 MB (gzipped: ~450 KB) due to Quill + Yjs being bundled
together. If this matters, consider dynamic imports (`import()`) for the Editor route.

---

## 📄 Related

- [Root README](../README.md) — full project overview, architecture diagram, setup guide
- [Server README](../server/README.md) — Express + Socket.IO signalling server
