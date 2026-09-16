import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

import Quill from "quill";
import "quill/dist/quill.snow.css";
import QuillCursors from "quill-cursors";

import { QuillBinding } from "y-quill";
import { createYjs } from "../services/yjsProvider";

import html2pdf from "html2pdf.js";
import { saveAs } from "file-saver";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

Quill.register("modules/cursors", QuillCursors);

/* ─── FONTS ──────────────────────────────────────────────────── */
// In Quill v2 the correct import path is attributors/class/font
const FontClass = Quill.import("attributors/class/font");
FontClass.whitelist = [
  "arial",
  "times-new-roman",
  "roboto",
  "open-sans",
  "lato",
  "montserrat",
  "poppins",
  "raleway",
  "ubuntu",
  "playfair",
  "merriweather",
  "source-code-pro",
  "nunito",
];
Quill.register(FontClass, true);

/** Display labels shown inside the toolbar dropdown */
const FONT_LABELS = {
  arial: "Arial",
  "times-new-roman": "Times New Roman",
  roboto: "Roboto",
  "open-sans": "Open Sans",
  lato: "Lato",
  montserrat: "Montserrat",
  poppins: "Poppins",
  raleway: "Raleway",
  ubuntu: "Ubuntu",
  playfair: "Playfair Display",
  merriweather: "Merriweather",
  "source-code-pro": "Source Code Pro",
  nunito: "Nunito",
};

/* ─── FONT SIZES ─────────────────────────────────────────────── */
// In Quill v2 the correct import path is attributors/class/size
// This generates .ql-size-<value> classes instead of inline styles,
// so our CSS classes in index.css actually take effect.
const SizeClass = Quill.import("attributors/class/size");
SizeClass.whitelist = [
  "8pt", "9pt", "10pt", "11pt", "12pt", "14pt", "16pt",
  "18pt", "20pt", "24pt", "28pt", "32pt", "36pt", "48pt", "72pt",
];
Quill.register(SizeClass, true);

/* ─── COLOURS used to assign per-user avatar colours ─────────── */
const USER_COLORS = [
  "#4285f4", "#ea4335", "#34a853", "#fbbc04",
  "#ff6d00", "#aa00ff", "#00acc1", "#e91e63",
];
function getRandomColor() {
  return USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

/* ─── Word/character counter ─────────────────────────────────── */
function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/* ─── Read document name from localStorage (pure helper) ─────── */
function loadDocName(docId) {
  try {
    const docs = JSON.parse(localStorage.getItem("docs") || "[]");
    const doc = docs.find((d) => d.id === docId);
    return doc?.name || "Untitled document";
  } catch {
    return "Untitled document";
  }
}

/* ─── Save document name to localStorage (pure helper) ─────────── */
function saveDocName(docId, name) {
  try {
    const docs = JSON.parse(localStorage.getItem("docs") || "[]");
    const exists = docs.some((d) => d.id === docId);
    if (!exists) return;
    const updated = docs.map((d) =>
      d.id === docId ? { ...d, name, updatedAt: Date.now() } : d
    );
    localStorage.setItem("docs", JSON.stringify(updated));
  } catch {
    // ignore
  }
}

/* ══════════════════════════════════════════════════════════════ */
export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const wrapperRef = useRef(null);
  const quillRef = useRef(null);

  // Initialise title directly from localStorage — no effect, no race
  const [title, setTitle] = useState(() => loadDocName(id));

  const [users, setUsers] = useState([]);
  const [activeUser, setActiveUser] = useState("");
  const [mode, setMode] = useState("edit");
  const [connected, setConnected] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [loadProgress, setLoadProgress] = useState(null); // chunked loading progress state

  // Track whether we've received the initial title via awareness
  // (so we don't overwrite a remote title with stale localStorage on first load)
  const titleInitRef = useRef(false);

  /* ── Re-load title if doc ID changes (navigation) ─────────── */
  useEffect(() => {
    titleInitRef.current = false;
    const name = loadDocName(id);
    queueMicrotask(() => setTitle(name));
  }, [id]);

  /* ── Persist title to localStorage whenever it changes ─────── */
  // We track whether we set the title ourselves (not from awareness)
  // to avoid re-broadcasting our own remote update.
  const titleFromRemoteRef = useRef(false);

  useEffect(() => {
    saveDocName(id, title);
  }, [id, title]);

  /* ── Export handlers ───────────────────────────────────────── */
  const exportPDF = useCallback(() => {
    const content = document.querySelector(".ql-editor");
    if (!content) return;
    html2pdf()
      .set({ margin: 10, filename: `${title}.pdf`, image: { type: "jpeg", quality: 0.98 } })
      .from(content)
      .save();
  }, [title]);

  const exportDocx = useCallback(() => {
    const content = document.querySelector(".ql-editor");
    if (!content) return;
    const blob = new Blob([content.innerText], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    saveAs(blob, `${title}.docx`);
  }, [title]);

  /* ── Build Quill + Yjs ─────────────────────────────────────── */
  useEffect(() => {
    if (!wrapperRef.current) return;

    wrapperRef.current.innerHTML = "";
    const container = document.createElement("div");
    wrapperRef.current.appendChild(container);

    const quill = new Quill(container, {
      theme: "snow",
      placeholder: "Start typing your document…",
      modules: {
        toolbar: {
          container: [
            [{ font: FontClass.whitelist }],
            [{ size: SizeClass.whitelist }],
            ["bold", "italic", "underline", "strike"],
            [{ color: [] }, { background: [] }],
            [{ align: [] }],
            [{ list: "ordered" }, { list: "bullet" }],
            [{ indent: "-1" }, { indent: "+1" }],
            ["link"],
            ["clean"],
          ],
        },
        cursors: true,
      },
      formats: [
        "font", "size",
        "bold", "italic", "underline", "strike",
        "color", "background",
        "align", "list", "indent",
        "link",
      ],
    });

    quillRef.current = quill;

    /* ── Apply human-readable font labels in the dropdown ─── */
    setTimeout(() => {
      const fontPicker = document.querySelector(".ql-font");
      if (fontPicker) {
        fontPicker.querySelectorAll(".ql-picker-item").forEach((item) => {
          const val = item.getAttribute("data-value") || "";
          if (val && FONT_LABELS[val]) {
            item.style.fontFamily = FONT_LABELS[val];
          }
        });
      }

      // Tooltips
      const tooltips = {
        ".ql-bold": "Bold (Ctrl+B)",
        ".ql-italic": "Italic (Ctrl+I)",
        ".ql-underline": "Underline (Ctrl+U)",
        ".ql-strike": "Strikethrough",
        ".ql-color": "Text colour",
        ".ql-background": "Highlight colour",
        ".ql-align": "Align text",
        ".ql-clean": "Clear formatting",
        ".ql-link": "Insert link",
        ".ql-indent": "Indent",
        ".ql-font": "Font family",
        ".ql-size": "Font size",
        ".ql-list": "List",
      };
      Object.entries(tooltips).forEach(([sel, tip]) => {
        document.querySelectorAll(sel).forEach((el) => el.setAttribute("title", tip));
      });
    }, 300);

    /* ── Debounced word/char counter (prevents UI freezing on large docs) ── */
    let countTimeout = null;
    quill.on("text-change", () => {
      if (countTimeout) clearTimeout(countTimeout);
      countTimeout = setTimeout(() => {
        const text = quill.getText();
        setWordCount(countWords(text));
        setCharCount(Math.max(0, text.length - 1));
      }, 300);
    });

    /* ── Yjs real-time collaboration ───────────────────────── */
    const docId = id || "default-doc";
    let cleanup = null;

    /* ── Socket.IO connection for chunked document transfers ── */
    const socket = io(API_URL);
    const chunkBufferRef = { chunks: [], total: 0 };

    socket.emit("join-document", docId);

    socket.on("load-document-start", ({ totalChunks }) => {
      chunkBufferRef.chunks = new Array(totalChunks);
      chunkBufferRef.total = totalChunks;
      setLoadProgress({ current: 0, total: totalChunks, percent: 0 });
    });

    socket.on("load-document-chunk", ({ chunk, chunkIndex, totalChunks, isLast }) => {
      chunkBufferRef.chunks[chunkIndex] = chunk;
      const received = chunkBufferRef.chunks.filter((c) => c !== undefined).length;
      const pct = Math.round((received / totalChunks) * 100);
      setLoadProgress({ current: received, total: totalChunks, percent: pct });

      if (isLast || received === totalChunks) {
        setTimeout(() => setLoadProgress(null), 600);
      }
    });

    socket.on("load-document", () => {
      setLoadProgress(null);
    });

    try {
      const { ydoc, provider, persistence } = createYjs(docId);

      provider.on("status", (event) => {
        setConnected(event.status === "connected");
      });

      if (persistence) {
        persistence.on("synced", () => {
          // IndexedDB offline cache synced fast
        });
      }

      const awareness = provider.awareness;
      const ytext = ydoc.getText("quill");

      new QuillBinding(ytext, quill, awareness);

      const cursors = quill.getModule("cursors");

      const userName = "User-" + Math.floor(Math.random() * 9000 + 1000);
      const userColor = getRandomColor();

      // Broadcast our user identity AND the current document title
      awareness.setLocalStateField("user", { name: userName, color: userColor });
      awareness.setLocalStateField("docTitle", loadDocName(docId));

      awareness.on("change", ({ removed }) => {
        // Remove cursors for clients that left
        removed.forEach((clientId) => {
          try {
            cursors.removeCursor(clientId);
          } catch {
            // cursor may not exist yet — safe to ignore
          }
        });

        const states = Array.from(awareness.getStates().entries());
        const list = [];
        let typing = "";

        states.forEach(([clientId, state]) => {
          if (!state.user) return;

          // Don't count ourselves — only show other collaborators
          if (clientId === awareness.clientID) return;

          list.push(state);

          // Create cursor if it doesn't exist yet for this client
          const existingCursors = cursors.cursors();
          if (!existingCursors[String(clientId)]) {
            cursors.createCursor(
              String(clientId),
              state.user.name,
              state.user.color
            );
          }

          if (state.selection) {
            cursors.moveCursor(String(clientId), state.selection);
            typing = state.user.name;
          }

          // Title sync: accept remote title updates
          if (
            state.docTitle &&
            state.docTitle !== loadDocName(docId)
          ) {
            titleFromRemoteRef.current = true;
            setTitle(state.docTitle);
            saveDocName(docId, state.docTitle);
          }
        });

        setUsers(list);
        setActiveUser(typing);
      });

      quill.on("selection-change", (range) => {
        awareness.setLocalStateField("selection", range);
      });

      cleanup = () => {
        if (countTimeout) clearTimeout(countTimeout);
        socket.disconnect();
        provider.disconnect();
        ydoc.destroy();
      };
    } catch (err) {
      console.warn("Yjs unavailable, running in local mode:", err.message);
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [id]);

  /* ── Broadcast title changes to other peers via awareness ───── */
  const awarenessRef = useRef(null);

  // Store a reference to the awareness object after Yjs mounts
  useEffect(() => {
    // Re-broadcast title whenever it changes (user typed in the title bar)
    // Skip if this change was received FROM a remote peer (avoid echo loop)
    if (titleFromRemoteRef.current) {
      titleFromRemoteRef.current = false;
      return;
    }

    if (awarenessRef.current) {
      awarenessRef.current.setLocalStateField("docTitle", title);
    }
  }, [title]);

  /* ── Simpler awareness ref capture via a post-mount effect ─── */
  useEffect(() => {
    if (!wrapperRef.current) return;
    // Re-obtain awareness from the Yjs provider each time the doc changes
    const docId = id || "default-doc";
    try {
      // We can't easily get a reference here without restructuring,
      // so we use a custom event approach instead:
      const handler = (e) => {
        awarenessRef.current = e.detail;
      };
      window.addEventListener(`yjs-awareness-${docId}`, handler);
      return () => window.removeEventListener(`yjs-awareness-${docId}`, handler);
    } catch {
      // ignore
    }
  }, [id]);

  /* ── Toggle view/edit mode ─────────────────────────────────── */
  useEffect(() => {
    if (!quillRef.current) return;
    mode === "view" ? quillRef.current.disable() : quillRef.current.enable();
  }, [mode]);

  /* ─── Handle title input change ─────────────────────────────── */
  const handleTitleChange = useCallback(
    (e) => {
      const newTitle = e.target.value;
      setTitle(newTitle);
      saveDocName(id, newTitle);

      // Broadcast immediately via awareness custom event
      window.dispatchEvent(
        new CustomEvent("doc-title-change", {
          detail: { docId: id, title: newTitle },
        })
      );
    },
    [id]
  );

  /* ─── Render ─────────────────────────────────────────────── */
  return (
    <>
      {/* ── Top navigation bar ─────────────────────────────── */}
      <div className="topbar">
        <div className="topbar-left">
          <button className="back-btn" onClick={() => navigate("/")} title="Back to documents">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="brand">
            <svg className="brand-icon" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="8" fill="#1a73e8"/>
              <path d="M10 10h14l6 6v14H10V10z" fill="white" opacity="0.9"/>
              <path d="M24 10v6h6" fill="none" stroke="#1a73e8" strokeWidth="1.5"/>
              <rect x="14" y="18" width="12" height="1.5" rx="0.75" fill="#1a73e8"/>
              <rect x="14" y="21.5" width="12" height="1.5" rx="0.75" fill="#1a73e8"/>
              <rect x="14" y="25" width="8" height="1.5" rx="0.75" fill="#1a73e8"/>
            </svg>
            <input
              className="doc-title-input"
              value={title}
              onChange={handleTitleChange}
              aria-label="Document title"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="topbar-right">
          {/* Collaborator avatars */}
          <div className="avatars" aria-label="Active collaborators">
            {users.slice(0, 5).map((u, i) => (
              <div
                key={i}
                className="avatar"
                style={{ background: u.user?.color || "#1a73e8" }}
                title={u.user?.name || "User"}
              >
                {(u.user?.name || "U")[0].toUpperCase()}
              </div>
            ))}
          </div>

          {loadProgress && (
            <div className="conn-badge chunk-progress" style={{ background: "#e8f0fe", color: "#1a73e8", borderColor: "#aecbfa" }} title={`Loading chunk ${loadProgress.current} of ${loadProgress.total}`}>
              <span className="conn-dot" style={{ background: "#1a73e8" }} />
              Loading {loadProgress.percent}%
            </div>
          )}

          <div className={`conn-badge ${connected ? "online" : "offline"}`}>
            <span className="conn-dot" />
            {connected ? "Connected" : "Offline"}
          </div>

          <button
            className={`mode-btn ${mode === "edit" ? "editing" : "viewing"}`}
            onClick={() => setMode(mode === "edit" ? "view" : "edit")}
            title={mode === "edit" ? "Switch to view mode" : "Switch to edit mode"}
          >
            {mode === "edit" ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Editing
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                Viewing
              </>
            )}
          </button>

          <div className="export-group">
            <button className="export-btn" onClick={exportPDF} title="Export as PDF">PDF</button>
            <button className="export-btn" onClick={exportDocx} title="Export as DOCX">DOCX</button>
          </div>
        </div>
      </div>

      {/* ── Editor area ─────────────────────────────────────── */}
      <div className="editor-shell">
        <div className="editor-container">
          {/* Status row */}
          <div className="editor-meta">
            {activeUser && (
              <span className="typing-indicator">
                <span className="typing-dots">
                  <span /><span /><span />
                </span>
                {activeUser} is typing…
              </span>
            )}
            <span className="word-count">
              {wordCount} {wordCount === 1 ? "word" : "words"} · {charCount} characters
            </span>
          </div>

          {/* Quill mount point */}
          <div ref={wrapperRef} className="quill-wrapper" />
        </div>
      </div>
    </>
  );
}