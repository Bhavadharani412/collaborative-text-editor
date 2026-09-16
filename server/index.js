const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const WebSocket = require("ws");
const { setupWSConnection } = require("y-websocket/bin/utils");

/* ─── Configuration ───────────────────────────────────────────── */
const PORT = process.env.PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const MAX_DOCUMENTS = 100; // memory safety cap

/* ─── App bootstrap ───────────────────────────────────────────── */
const app = express();

app.use(
  cors({
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  })
);

/* Health-check endpoint */
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    documents: Object.keys(documents).length,
    uptime: process.uptime(),
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
  },
});

/* ─── Yjs WebSocket server (noServer mode) ────────────────────── */
/**
 * Attach a Yjs WebSocket server to the same HTTP server on the /yjs path.
 * noServer: true — it shares the HTTP server's port; no second port is opened.
 * Socket.IO handles its own /socket.io upgrades internally, so we only
 * forward upgrade requests whose pathname starts with /yjs.
 */
const wss = new WebSocket.Server({ noServer: true, perMessageDeflate: true });

wss.on("connection", setupWSConnection);

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url, "http://x").pathname;

  if (pathname === "/yjs") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  }
  // All other paths (e.g. /socket.io) are handled by their own
  // middleware — do NOT destroy the socket here.
});

/* ─── In-memory document store ────────────────────────────────── */
/**
 * Stores document content keyed by docId.
 * Capped at MAX_DOCUMENTS via simple LRU-style eviction.
 */
const documents = {};
const documentOrder = []; // insertion order for eviction
const CHUNK_SIZE = 64 * 1024; // 64KB chunk size threshold

function storeDocument(docId, content) {
  if (!documents[docId]) {
    // New document — check cap
    if (documentOrder.length >= MAX_DOCUMENTS) {
      const evicted = documentOrder.shift();
      delete documents[evicted];
      console.warn(`[store] Evicted oldest document: ${evicted}`);
    }
    documentOrder.push(docId);
  }
  documents[docId] = content;
}

/* ─── Socket.IO events ────────────────────────────────────────── */
io.on("connection", (socket) => {
  console.log(`[socket] User connected: ${socket.id}`);

  /**
   * FIX: join-document only joins the room and sends the initial load.
   * Large documents (> 64KB) are transmitted in sequential chunks to optimize memory and transfer speeds.
   */
  socket.on("join-document", (docId) => {
    if (!docId || typeof docId !== "string") {
      socket.emit("error", { message: "Invalid document ID" });
      return;
    }

    // Leave any previously joined document room
    const prevRooms = [...socket.rooms].filter((r) => r !== socket.id);
    prevRooms.forEach((r) => socket.leave(r));

    socket.join(docId);
    socket.data.docId = docId; // store on socket for later events

    if (!documents[docId]) {
      storeDocument(docId, "");
    }

    const content = documents[docId] || "";
    if (typeof content === "string" && content.length > CHUNK_SIZE) {
      const totalChunks = Math.ceil(content.length / CHUNK_SIZE);
      console.log(`[socket] Transmitting doc ${docId} in ${totalChunks} chunks to ${socket.id}`);
      socket.emit("load-document-start", { docId, totalChunks, totalSize: content.length });
      for (let i = 0; i < totalChunks; i++) {
        const chunk = content.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        socket.emit("load-document-chunk", {
          docId,
          chunk,
          chunkIndex: i,
          totalChunks,
          isLast: i === totalChunks - 1,
        });
      }
    } else {
      socket.emit("load-document", content);
    }
    console.log(`[socket] ${socket.id} joined document: ${docId}`);
  });

  /* Broadcast delta to all OTHER clients in the same document room */
  socket.on("send-changes", (delta) => {
    try {
      const docId = socket.data.docId;
      if (!docId) return;
      socket.to(docId).emit("receive-changes", delta);
    } catch (err) {
      console.error("[socket] send-changes error:", err.message);
    }
  });

  /* Persist latest document snapshot */
  socket.on("save-document", (data) => {
    try {
      const docId = socket.data.docId;
      if (!docId) return;
      storeDocument(docId, data);
    } catch (err) {
      console.error("[socket] save-document error:", err.message);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`[socket] User disconnected: ${socket.id} (${reason})`);
  });

  socket.on("error", (err) => {
    console.error(`[socket] Socket error for ${socket.id}:`, err.message);
  });
});

/* ─── Start server ────────────────────────────────────────────── */
server.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
  console.log(`[server] Accepting connections from: ${CLIENT_ORIGIN}`);
});

/* ─── Graceful shutdown ───────────────────────────────────────── */
function shutdown(signal) {
  console.log(`\n[server] Received ${signal}. Shutting down gracefully…`);
  server.close(() => {
    console.log("[server] HTTP server closed.");
    process.exit(0);
  });
  // Force quit after 5 seconds if still open
  setTimeout(() => {
    console.error("[server] Forced exit after timeout.");
    process.exit(1);
  }, 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
