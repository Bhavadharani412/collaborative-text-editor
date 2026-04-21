import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import Quill from "quill";
import "quill/dist/quill.snow.css";
import QuillCursors from "quill-cursors";

import { QuillBinding } from "y-quill";
import { createYjs } from "../services/yjsProvider";

import html2pdf from "html2pdf.js";
import { saveAs } from "file-saver";

Quill.register("modules/cursors", QuillCursors);

/* FONTS */
const Font = Quill.import("formats/font");
Font.whitelist = [
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
];
Quill.register(Font, true);

/* FONT SIZES */
const Size = Quill.import("formats/size");
Size.whitelist = ["8px", "12px", "16px", "20px", "24px"];
Quill.register(Size, true);

export default function Editor() {
  const { id } = useParams();
  const wrapperRef = useRef(null);
  const quillRef = useRef(null);

  const [users, setUsers] = useState([]);
  const [activeUser, setActiveUser] = useState("");
  const [mode, setMode] = useState("edit");
  const [title, setTitle] = useState("Untitled document");
  const [connected, setConnected] = useState(false);

  /* LOAD TITLE */
  useEffect(() => {
    const docs = JSON.parse(localStorage.getItem("docs") || "[]");
    const current = docs.find((d) => d.id === id);
    if (current) setTitle(current.name);
  }, [id]);

  /* SAVE TITLE */
  useEffect(() => {
    const docs = JSON.parse(localStorage.getItem("docs") || "[]");
    const exists = docs.some((d) => d.id === id);
    if (!exists) return;

    const updated = docs.map((d) =>
      d.id === id ? { ...d, name: title } : d
    );

    localStorage.setItem("docs", JSON.stringify(updated));
  }, [title, id]);

  /* EXPORT */
  const exportPDF = () => {
    const content = document.querySelector(".ql-editor");
    html2pdf().from(content).save("document.pdf");
  };

  const exportDocx = () => {
    const content = document.querySelector(".ql-editor").innerText;
    const blob = new Blob([content], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    saveAs(blob, "document.docx");
  };

  useEffect(() => {
    if (!wrapperRef.current) return;

    wrapperRef.current.innerHTML = "";

    const container = document.createElement("div");
    wrapperRef.current.append(container);

   const quill = new Quill(container, {
  theme: "snow",
  placeholder: "Start typing your document...",
  modules: {
    toolbar: [
      [{ font: Font.whitelist }],
      [{ size: Size.whitelist }],
      ["bold", "italic", "underline", "strike"],
      [{ color: [] }, { background: [] }],
      [{ align: [] }],
      [{ list: "ordered" }, { list: "bullet" }],
      ["clean"],
    ],
    cursors: true,
  },
  formats: [
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "color",
    "background",
    "align",
    "list",
  ],
});

    quillRef.current = quill;

    /* ✅ TOOLTIP FIX */
    setTimeout(() => {
      const map = {
        ".ql-bold": "Bold",
        ".ql-italic": "Italic",
        ".ql-underline": "Underline",
        ".ql-strike": "Strikethrough",
        ".ql-color": "Text color",
        ".ql-background": "Highlight color",
        ".ql-align": "Align text",
        ".ql-clean": "Clear formatting",
      };

      Object.entries(map).forEach(([selector, text]) => {
        document.querySelectorAll(selector).forEach((el) => {
          el.setAttribute("title", text);
        });
      });

      document.querySelectorAll(".ql-font").forEach(el => {
        el.setAttribute("title", "Font family");
      });

      document.querySelectorAll(".ql-size").forEach(el => {
        el.setAttribute("title", "Font size");
      });

    }, 300);

    const docId = id || "default-doc";

    try {
      const { ydoc, provider } = createYjs(docId);

      provider.on("status", (event) => {
        setConnected(event.status === "connected");
      });

      const awareness = provider.awareness;
      const ytext = ydoc.getText("quill");

      new QuillBinding(ytext, quill, awareness);

      const cursors = quill.getModule("cursors");

      const user = {
        name: "User-" + Math.floor(Math.random() * 1000),
        color: "#" + Math.floor(Math.random() * 16777215).toString(16),
      };

      awareness.setLocalStateField("user", user);

      awareness.on("change", () => {
        const states = Array.from(awareness.getStates().entries());

        const list = [];
        let typing = "";

        states.forEach(([clientId, state]) => {
          if (!state.user) return;

          list.push(state);

          /* ✅ PREVENT DUPLICATE CURSORS */
          if (!cursors.cursors()[clientId]) {
            cursors.createCursor(
              clientId,
              state.user.name,
              state.user.color
            );
          }

          if (state.selection) {
            cursors.moveCursor(clientId, state.selection);
            typing = state.user.name;
          }
        });

        setUsers(list);
        setActiveUser(typing);
      });

      quill.on("selection-change", (range) => {
        awareness.setLocalStateField("selection", range);
      });

      return () => {
        provider.disconnect();
        ydoc.destroy();
      };
    } catch (err) {
      console.log("Yjs failed, running local mode");
    }
  }, [id]);

  /* MODE */
  useEffect(() => {
    if (!quillRef.current) return;
    mode === "view"
      ? quillRef.current.disable()
      : quillRef.current.enable();
  }, [mode]);

  return (
    <>
      <div className="topbar">
        <button
          className={`toggle ${mode === "edit" ? "active" : ""}`}
          onClick={() => setMode(mode === "edit" ? "view" : "edit")}
        >
          {mode === "edit" ? "Editing" : "Viewing"}
        </button>

        <div className="right">
          <button onClick={exportPDF}>PDF</button>
          <button onClick={exportDocx}>DOCX</button>
        </div>
      </div>

      <div className="editor-container">
        <input
          className="doc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="status">
          {connected ? "🟢 Connected" : "🔴 Offline"} • {users.length} users
        </div>

        <div className="typing">
          {activeUser && `${activeUser} is typing...`}
        </div>

        <div ref={wrapperRef}></div>
      </div>
    </>
  );
}