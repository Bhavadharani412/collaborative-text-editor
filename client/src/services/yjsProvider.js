import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";

/**
 * Yjs WebSocket URL.
 * Local dev  → ws://localhost:3001/yjs  (set in .env.local)
 * Production → wss://<render-host>/yjs  (set in Vercel env vars)
 */
const YJS_URL =
  import.meta.env.VITE_YJS_URL || "ws://localhost:3001/yjs";

export const createYjs = (docId) => {
  const ydoc = new Y.Doc();

  const persistence = new IndexeddbPersistence(docId, ydoc);

  const provider = new WebsocketProvider(YJS_URL, docId, ydoc);

  return { ydoc, provider, persistence };
};