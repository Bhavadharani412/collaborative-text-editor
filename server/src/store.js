/**
 * Issue #4 — Real persistence layer.
 *
 * Replaces the in-memory map + LRU eviction with a durable SQLite store
 * (better-sqlite3, WAL mode). Exposed behind a small DocumentStore
 * interface (get/set/delete/list/count/flush/close) so a Postgres or
 * MongoDB driver can be swapped in later without touching socket logic.
 *
 * Writes are synchronous to SQLite (fast, crash-safe); an in-memory cache
 * avoids disk reads on every join, and `flush()` is called on graceful
 * shutdown so nothing buffered is lost.
 */
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("./config");
const log = require("./logger")("store");

class SqliteDocumentStore {
  /** @param {string} [dbPath] defaults to config.DB_PATH */
  constructor(dbPath = config.DB_PATH) {
    if (dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        doc_id     TEXT PRIMARY KEY,
        content    TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);
    `);

    /* Prepared statements for hot paths. */
    this._stmts = {
      get: this.db.prepare("SELECT content FROM documents WHERE doc_id = ?"),
      insert: this.db.prepare("INSERT INTO documents (doc_id, content, updated_at) VALUES (?, ?, ?)"),
      update: this.db.prepare("UPDATE documents SET content = ?, updated_at = ? WHERE doc_id = ?"),
      del: this.db.prepare("DELETE FROM documents WHERE doc_id = ?"),
      list: this.db.prepare("SELECT doc_id, length(content) AS size, updated_at FROM documents ORDER BY updated_at DESC"),
      count: this.db.prepare("SELECT COUNT(*) AS n FROM documents"),
    };

    /* Warm read cache (single source of truth remains SQLite). */
    this.cache = new Map();
    for (const row of this._stmts.list.all()) {
      const c = this._stmts.get.get(row.doc_id);
      this.cache.set(row.doc_id, c ? c.content : "");
    }
    log.info({ docs: this.cache.size, dbPath }, "document store ready");
  }

  /** @returns {string | undefined} cached/durable content, undefined if unknown */
  get(docId) {
    if (this.cache.has(docId)) return this.cache.get(docId);
    const row = this._stmts.get.get(docId);
    if (row) this.cache.set(docId, row.content);
    return row ? row.content : undefined;
  }

  /** Durable write-through. */
  set(docId, content) {
    const value = content == null ? "" : String(content);
    const now = Date.now();
    if (this.cache.has(docId) || this._stmts.get.get(docId)) {
      this._stmts.update.run(value, now, docId);
    } else {
      this._stmts.insert.run(docId, value, now);
    }
    this.cache.set(docId, value);
  }

  delete(docId) {
    this.cache.delete(docId);
    this._stmts.del.run(docId);
  }

  list() {
    return this._stmts.list.all();
  }

  count() {
    return this._stmts.count.get().n;
  }

  /** Health check used by /health (Issue #14 groundwork). */
  ping() {
    this.db.prepare("SELECT 1").get();
    return true;
  }

  flush() {
    try {
      this.db.pragma("wal_checkpoint(FULL)");
    } catch (err) {
      log.error({ err: err.message }, "checkpoint failed");
    }
  }

  close() {
    this.flush();
    this.db.close();
    log.info("document store closed");
  }
}

module.exports = { SqliteDocumentStore };
