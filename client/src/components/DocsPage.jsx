import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { getDocs, saveDocs } from "../services/storage";
import { generateId } from "../utils/generateId";

export default function DocsPage() {
  const [docs, setDocs] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    setDocs(getDocs());
  }, []);

  const createDoc = () => {
    const name = prompt("Enter document name:");
    if (!name) return;

    const id = generateId(name);

    const updated = [...docs, { id, name }];
    setDocs(updated);
    saveDocs(updated);

    navigate("/" + id);
  };

  const deleteDoc = (id) => {
    const updated = docs.filter((d) => d.id !== id);
    setDocs(updated);
    saveDocs(updated);
  };

  return (
    <div className="docs-container">
      <div className="docs-header">
        <h2>Documents</h2>
        <button onClick={createDoc}>+ New</button>
      </div>

      {/* EMPTY STATE */}
      {docs.length === 0 && (
        <div className="empty-state">
          <h3>No documents yet</h3>
          <button onClick={createDoc}>Create your first doc</button>
        </div>
      )}

      <div className="docs-grid">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="doc-card"
            onClick={() => navigate("/" + doc.id)}
          >
            <div className="doc-title" title={doc.name}>
              {doc.name}
            </div>

            <div className="doc-id">
              {doc.id ? doc.id.slice(0, 15) + "..." : "No ID"}
            </div>

            <button
              className="delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                deleteDoc(doc.id);
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}