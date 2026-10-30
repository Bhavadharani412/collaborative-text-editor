/**
 * Entry point — boots the unified server (Express REST + Socket.IO + Yjs
 * relay on one port) with a durable SQLite document store.
 *
 * Maturity fixes implemented here:
 *  #1 dotenv config      → src/config.js
 *  #2 structured logging → src/logger.js
 *  #3 input validation   → src/validation.js
 *  #4 real persistence   → src/store.js (no more in-memory-only docs,
 *                          no LRU eviction; content survives restarts)
 */
const config = require("./src/config");
const log = require("./src/logger")("server");
const { SqliteDocumentStore } = require("./src/store");
const { createApp } = require("./src/app");

const store = new SqliteDocumentStore(config.DB_PATH);
const { server, close } = createApp({ store });

server.listen(config.PORT, () => {
  log.info(
    { port: config.PORT, origin: config.CLIENT_ORIGIN, db: config.DB_PATH, env: config.env },
    "server running"
  );
});

/* ─── Graceful shutdown — flush durable store before exit ──────── */
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutting down gracefully…");
  close().then(() => {
    store.close();
    log.info("HTTP server closed, store flushed");
    process.exit(0);
  });
  // Force quit after 5 seconds if still open
  setTimeout(() => {
    log.fatal("forced exit after timeout");
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  log.fatal({ err: { message: err.message, stack: err.stack } }, "uncaught exception");
  shutdown("uncaughtException");
});
