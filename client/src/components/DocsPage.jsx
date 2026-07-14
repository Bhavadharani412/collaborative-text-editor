import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { getDocs, saveDocs } from "../services/storage";
import { generateId } from "../utils/generateId";

/* ── Friendly relative-time formatter ───────────────────────── */
function timeAgo(timestamp) {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ── Document colour palette (used for card accents) ────────── */
const CARD_COLORS = [
  "#4285f4", "#ea4335", "#34a853", "#fbbc04",
  "#ff6d00", "#aa00ff", "#00acc1", "#e91e63",
];

function cardColor(id) {
  if (!id) return CARD_COLORS[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return CARD_COLORS[Math.abs(hash) % CARD_COLORS.length];
}

/* ══════════════════════════════════════════════════════════════ */
export default function DocsPage() {
  const [docs, setDocs] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = getDocs();
    queueMicrotask(() => setDocs(stored));
  }, []);

  /* Focus input when modal opens */
  useEffect(() => {
    if (modalOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [modalOpen]);

  const openModal = () => {
    setNewName("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setNewName("");
  };

  const createDoc = () => {
    const name = newName.trim();
    if (!name) return;

    const id = generateId(name);
    const now = Date.now();
    const updated = [...docs, { id, name, createdAt: now, updatedAt: now }];
    setDocs(updated);
    saveDocs(updated);
    closeModal();
    navigate("/" + id);
  };

  const deleteDoc = (id) => {
    const updated = docs.filter((d) => d.id !== id);
    setDocs(updated);
    saveDocs(updated);
    setDeleteTarget(null);
  };

  const filteredDocs = docs.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="docs-shell">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="docs-header">
        <div className="docs-brand">
          <svg className="brand-icon-lg" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="8" fill="#1a73e8"/>
            <path d="M10 10h14l6 6v14H10V10z" fill="white" opacity="0.9"/>
            <path d="M24 10v6h6" fill="none" stroke="#1a73e8" strokeWidth="1.5"/>
            <rect x="14" y="18" width="12" height="1.5" rx="0.75" fill="#1a73e8"/>
            <rect x="14" y="21.5" width="12" height="1.5" rx="0.75" fill="#1a73e8"/>
            <rect x="14" y="25" width="8" height="1.5" rx="0.75" fill="#1a73e8"/>
          </svg>
          <h1 className="docs-brand-name">Collaborative Docs</h1>
        </div>

        <div className="docs-header-actions">
          <div className="search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="search"
              placeholder="Search documents…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              aria-label="Search documents"
            />
          </div>
          <button className="new-doc-btn" onClick={openModal} id="create-doc-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New document
          </button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────── */}
      <main className="docs-main">
        {/* Start new — quick create card */}
        <section className="start-section">
          <p className="section-label">Start a new document</p>
          <div className="start-grid">
            <button className="start-card" onClick={openModal} id="start-blank-doc">
              <div className="start-card-preview blank-preview">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5f6368" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <span>Blank document</span>
            </button>
          </div>
        </section>

        <div className="section-divider" />

        {/* Recent documents */}
        <section className="recent-section">
          <p className="section-label">
            {searchQuery ? `Results for "${searchQuery}"` : "Recent documents"}
            {filteredDocs.length > 0 && (
              <span className="doc-count">{filteredDocs.length}</span>
            )}
          </p>

          {filteredDocs.length === 0 ? (
            <div className="empty-state">
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="80" height="80" rx="20" fill="#f1f3f4"/>
                <path d="M24 20h26l10 10v30H24V20z" fill="#e8eaed"/>
                <path d="M50 20v10h10" fill="none" stroke="#bdc1c6" strokeWidth="2"/>
                <rect x="30" y="36" width="20" height="2" rx="1" fill="#bdc1c6"/>
                <rect x="30" y="41" width="20" height="2" rx="1" fill="#bdc1c6"/>
                <rect x="30" y="46" width="14" height="2" rx="1" fill="#bdc1c6"/>
              </svg>
              <h3>{searchQuery ? "No documents found" : "No documents yet"}</h3>
              <p>{searchQuery ? "Try a different search term." : "Create your first document to get started."}</p>
              {!searchQuery && (
                <button className="new-doc-btn" onClick={openModal}>
                  Create document
                </button>
              )}
            </div>
          ) : (
            <div className="docs-grid">
              {filteredDocs.map((doc) => (
                <article
                  key={doc.id}
                  className="doc-card"
                  onClick={() => navigate("/" + doc.id)}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && navigate("/" + doc.id)}
                  aria-label={`Open document: ${doc.name}`}
                >
                  <div className="doc-card-preview" style={{ borderTop: `4px solid ${cardColor(doc.id)}` }}>
                    <div className="doc-lines">
                      <div className="doc-line" style={{ width: "80%", background: cardColor(doc.id) + "33" }} />
                      <div className="doc-line" style={{ width: "65%" }} />
                      <div className="doc-line" style={{ width: "75%" }} />
                      <div className="doc-line" style={{ width: "50%" }} />
                    </div>
                  </div>

                  <div className="doc-card-body">
                    <div className="doc-card-name" title={doc.name}>{doc.name}</div>
                    <div className="doc-card-meta">
                      <span className="doc-card-id">{doc.id.slice(0, 12)}…</span>
                      <span className="doc-card-time">{timeAgo(doc.updatedAt)}</span>
                    </div>
                  </div>

                  <button
                    className="doc-delete-btn"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(doc); }}
                    title="Delete document"
                    aria-label={`Delete ${doc.name}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                    </svg>
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* ── Create document modal ─────────────────────────────── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal} role="dialog" aria-modal="true" aria-label="Create document">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Create new document</h2>
            <p className="modal-subtitle">Give your document a name to get started.</p>

            <input
              ref={inputRef}
              className="modal-input"
              type="text"
              placeholder="Untitled document"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createDoc(); if (e.key === "Escape") closeModal(); }}
              maxLength={120}
              aria-label="Document name"
            />

            <div className="modal-actions">
              <button className="modal-cancel" onClick={closeModal}>Cancel</button>
              <button
                className="modal-create"
                onClick={createDoc}
                disabled={!newName.trim()}
                id="confirm-create-doc"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ─────────────────────────── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => setDeleteTarget(null)} role="dialog" aria-modal="true" aria-label="Confirm delete">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Delete document?</h2>
            <p className="modal-subtitle">
              "<strong>{deleteTarget.name}</strong>" will be permanently deleted.
              This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className="modal-delete"
                onClick={() => deleteDoc(deleteTarget.id)}
                id="confirm-delete-doc"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}