/**
 * Issue #6 — Unit tests for the validation layer (strict input guards).
 */
const { describe, it } = require("node:test");
const { expect } = require("./helpers.cjs");
const { validateDocId, validateContent, validateDelta } = require("../src/validation");

describe("validateDocId", () => {
  it("accepts well-formed ids", () => {
    for (const id of ["abc", "doc_123", "My-Doc-9", "a".repeat(64)]) {
      expect(validateDocId(id).ok).toBe(true);
    }
  });

  it("rejects non-string and empty values", () => {
    for (const bad of [undefined, null, 123, {}, [], true, ""]) {
      expect(validateDocId(bad).ok).toBe(false);
    }
  });

  it("rejects oversized ids (>64 chars)", () => {
    expect(validateDocId("a".repeat(65)).ok).toBe(false);
  });

  it("rejects prototype-pollution style keys", () => {
    for (const bad of ["__proto__", "constructor", "prototype"]) {
      expect(validateDocId(bad).ok).toBe(false);
    }
  });

  it("rejects malicious / fuzzed inputs (100% invalid ids rejected)", () => {
    const evil = [
      "../../etc/passwd",
      "<script>alert(1)</script>",
      "doc/../other",
      "id with spaces",
      "emoji-\u{1F680}",
      "null\0byte",
      "' OR 1=1 --",
      "\u4F60\u597D\u4E16\u754C", // non-ASCII
      "a?b#c&d",
      "\u0000start",
    ];
    for (const bad of evil) {
      expect(validateDocId(bad).ok).toBe(false);
    }
  });
});

describe("validateContent", () => {
  it("accepts strings within size cap and explicit clears", () => {
    expect(validateContent("").ok).toBe(true);
    expect(validateContent("<p>hello</p>").ok).toBe(true);
    expect(validateContent(null).ok).toBe(true);
  });

  it("rejects oversized documents", () => {
    expect(validateContent("x".repeat(2 * 1024 * 1024)).ok).toBe(false);
  });

  it("rejects non-string payloads (objects, arrays, numbers)", () => {
    for (const bad of [{}, [], 42, true]) {
      expect(validateContent(bad).ok).toBe(false);
    }
  });
});

describe("validateDelta", () => {
  it("accepts Quill-shaped deltas", () => {
    expect(validateDelta({ ops: [{ insert: "hi" }] }).ok).toBe(true);
    expect(validateDelta({ ops: [] }).ok).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(validateDelta(null).ok).toBe(false);
    expect(validateDelta("string").ok).toBe(false);
    expect(validateDelta({}).ok).toBe(false);
    expect(validateDelta({ ops: "not-an-array" }).ok).toBe(false);
  });

  it("rejects absurdly large deltas", () => {
    const big = { ops: Array.from({ length: 200000 }, () => ({ insert: "x".repeat(10) })) };
    expect(validateDelta(big).ok).toBe(false);
  });
});
