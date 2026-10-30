/**
 * Issue #3 — Input validation.
 *
 * Strict, centralized guards for every client-supplied value that reaches
 * the socket layer. Rejects malformed doc IDs (fuzzing, oversized strings,
 * prototype-pollution keys like "__proto__", control chars, HTML/scripts)
 * and caps payload sizes so a malicious client cannot exhaust memory.
 */
const config = require("./config");

/* docId: 1–64 chars, URL/socket-room safe subset only. */
const DOC_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/* Never allow JS internal keys as document IDs. */
const BLOCKED_IDS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * @param {unknown} docId
 * @returns {null | { ok: true } | { ok: false, reason: string }}
 */
function validateDocId(docId) {
  if (typeof docId !== "string") return { ok: false, reason: "docId must be a string" };
  if (docId.length === 0) return { ok: false, reason: "docId must not be empty" };
  if (docId.length > 64) return { ok: false, reason: "docId too long (max 64 chars)" };
  if (BLOCKED_IDS.has(docId)) return { ok: false, reason: "docId is reserved" };
  if (!DOC_ID_RE.test(docId)) {
    return { ok: false, reason: "docId may only contain letters, digits, '-' or '_'" };
  }
  return { ok: true };
}

/**
 * Validate document content coming from `save-document`.
 * Allowed: plain strings up to MAX_DOC_SIZE bytes. Delta objects are
 * validated structurally elsewhere when forwarding.
 */
function validateContent(content) {
  if (typeof content === "string") {
    if (Buffer.byteLength(content, "utf8") > config.MAX_DOC_SIZE) {
      return { ok: false, reason: `document exceeds max size (${config.MAX_DOC_SIZE} bytes)` };
    }
    return { ok: true };
  }
  if (content === null) return { ok: true }; // explicit clear
  return { ok: false, reason: "document content must be a string" };
}

/** Basic shape check for forwarded Quill deltas (never trust clients). */
function validateDelta(delta) {
  if (delta === null || typeof delta !== "object") {
    return { ok: false, reason: "delta must be an object" };
  }
  if (!Array.isArray(delta.ops)) {
    return { ok: false, reason: "delta.ops must be an array" };
  }
  const json = JSON.stringify(delta);
  if (Buffer.byteLength(json, "utf8") > config.MAX_DOC_SIZE) {
    return { ok: false, reason: "delta too large" };
  }
  return { ok: true };
}

module.exports = { validateDocId, validateContent, validateDelta, DOC_ID_RE };
