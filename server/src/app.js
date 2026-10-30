/**
 * App factory — wires Express + Socket.IO + Yjs relay around an injected
 * DocumentStore, so tests can boot the whole server against :memory: or a
 * temp SQLite file and exercise real sockets.
 *
 * Implements Issues #2 (structured logs), #3 (validation), #4 (persistence):
 *  - every join/save/broadcast is logged with socket/doc metadata
 *  - docId and payload validation rejects malicious input before storage
 *  - document content lives in durable SQLite, not an evictable memory map
 */
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const WebSocket = require("ws");
const { setupWSConnection } = require("y-websocket/bin/utils");

const config = require("./config");
const log = require("./logger")("app");
const { validateDocId, validateContent, validateDelta } = require("./validation");

/**
 * @param {{ store: import("./store").SqliteDocumentStore }} deps
 * @returns {{ app, server, io, wss, close: () => Promise<void> }}
 */
function createApp({ store }) {
  const app = express();

  app.use(
    cors({
      origin: config.CLIENT_ORIGIN,
      methods: ["GET", "POST"],
    })
  );

  /* Health-check endpoint — includes durable-store status. */
  app.get("/health", (_req, res) => {
    let db = "ok";
    try {
      store.ping();
    } catch (err) {
      db = "unavailable";
      log.error({ err: err.message }, "health: store ping failed");
    }
    res.json({
      status: db === "ok" ? "ok" : "degraded",
      store: db,
      documents: store.count(),
      uptime: process.uptime(),
    });
  });

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: config.CLIENT_ORIGIN,
      methods: ["GET", "POST"],
    },
  });

  /* ─── Yjs WebSocket relay (noServer mode, shares port on /yjs) ─── */
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

  /* ─── Socket.IO events ─────────────────────────────────────────── */
  io.on("connection", (socket) => {
    log.info({ socketId: socket.id }, "user connected");

    /**
     * Join a document room and send the initial load.
     * Large documents (> CHUNK_SIZE) are transmitted in sequential chunks.
     */
    socket.on("join-document", (docId) => {
      const check = validateDocId(docId);
      if (!check.ok) {
        log.warn({ socketId: socket.id, raw: String(docId).slice(0, 80), reason: check.reason }, "rejected join-document");
        socket.emit("error", { message: "Invalid document ID", reason: check.reason });
        return;
      }

      // Leave any previously joined document room
      const prevRooms = [...socket.rooms].filter((r) => r !== socket.id);
      prevRooms.forEach((r) => socket.leave(r));

      socket.join(docId);
      socket.data.docId = docId; // store on socket for later events

      if (store.get(docId) === undefined) {
        store.set(docId, ""); // first touch creates a durable row
      }

      const content = store.get(docId) || "";
      if (content.length > config.CHUNK_SIZE) {
        const totalChunks = Math.ceil(content.length / config.CHUNK_SIZE);
        log.info({ socketId: socket.id, docId, totalChunks }, "transmitting doc in chunks");
        socket.emit("load-document-start", { docId, totalChunks, totalSize: content.length });
        for (let i = 0; i < totalChunks; i++) {
          const chunk = content.substring(i * config.CHUNK_SIZE, (i + 1) * config.CHUNK_SIZE);
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
      log.info({ socketId: socket.id, docId, size: content.length }, "joined document");
    });

    /* Broadcast delta to all OTHER clients in the same document room */
    socket.on("send-changes", (delta) => {
      try {
        const docId = socket.data.docId;
        if (!docId) return;
        const check = validateDelta(delta);
        if (!check.ok) {
          log.warn({ socketId: socket.id, docId, reason: check.reason }, "rejected send-changes");
          socket.emit("error", { message: "Invalid change payload", reason: check.reason });
          return;
        }
        socket.to(docId).emit("receive-changes", delta);
      } catch (err) {
        log.error({ socketId: socket.id, err: err.message }, "send-changes error");
      }
    });

    /* Persist latest document snapshot to the durable store */
    socket.on("save-document", (data) => {
      try {
        const docId = socket.data.docId;
        if (!docId) return;
        const check = validateContent(data);
        if (!check.ok) {
          log.warn({ socketId: socket.id, docId, reason: check.reason }, "rejected save-document");
          socket.emit("error", { message: "Invalid document payload", reason: check.reason });
          return;
        }
        store.set(docId, data);
        log.debug({ socketId: socket.id, docId, size: data == null ? 0 : data.length }, "document saved");
      } catch (err) {
        log.error({ socketId: socket.id, err: err.message }, "save-document error");
      }
    });

    socket.on("disconnect", (reason) => {
      log.info({ socketId: socket.id, reason, docId: socket.data.docId }, "user disconnected");
    });

    socket.on("error", (err) => {
      log.error({ socketId: socket.id, err: err.message }, "socket error");
    });
  });

  async function close() {
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
  }

  return { app, server, io, wss, close };
}

module.exports = { createApp };
