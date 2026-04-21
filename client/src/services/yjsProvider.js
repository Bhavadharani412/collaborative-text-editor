import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";

export const createYjs = (docId) => {
  const ydoc = new Y.Doc();

  new IndexeddbPersistence(docId, ydoc);

  const provider = new WebsocketProvider(
    "ws://localhost:1234",
    docId,
    ydoc
  );

  return { ydoc, provider };
};