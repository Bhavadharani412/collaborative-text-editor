/**
 * Issue #6 — Store unit tests + Issue #5 restart-survival proof.
 * A new SqliteDocumentStore instance pointed at the same file must see
 * everything a previous instance wrote (exactly what happens on restart).
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const { expect } = require("./helpers.cjs");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { SqliteDocumentStore } = require("../src/store");

let file, dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "collab-test-"));
  file = path.join(dir, "docs.sqlite");
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("SqliteDocumentStore", () => {
  it("round-trips content", () => {
    const store = new SqliteDocumentStore(file);
    store.set("doc1", "<p>hello world</p>");
    expect(store.get("doc1")).toBe("<p>hello world</p>");
    expect(store.get("missing")).toBeUndefined();
    store.close();
  });

  it("upserts and deletes", () => {
    const store = new SqliteDocumentStore(file);
    store.set("d", "v1");
    store.set("d", "v2");
    expect(store.get("d")).toBe("v2");
    expect(store.count()).toBe(1);
    store.delete("d");
    expect(store.get("d")).toBeUndefined();
    expect(store.count()).toBe(0);
    store.close();
  });

  it("lists documents newest-first", () => {
    const store = new SqliteDocumentStore(file);
    store.set("a", "1");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5); // ensure distinct ms timestamps
    store.set("b", "22");
    const rows = store.list();
    expect(rows.map((r) => r.doc_id)).toEqual(["b", "a"]);
    expect(rows.find((r) => r.doc_id === "b").size).toBe(2);
    store.close();
  });

  it("ping() reports health", () => {
    const store = new SqliteDocumentStore(file);
    expect(store.ping()).toBe(true);
    store.close();
  });

  /* ── Issue #5: persistence across "restarts" ─────────────────── */
  it("survives simulated restarts: 100% of docs recover with identical content", () => {
    const N = 25;
    const expected = {};
    const w1 = new SqliteDocumentStore(file);
    for (let i = 0; i < N; i++) {
      const id = `doc_${i}`;
      expected[id] = `<p>content ${i}</p>`;
      w1.set(id, expected[id]);
    }
    w1.close(); // graceful shutdown

    // "Restart": fresh process opens the same durable file
    const w2 = new SqliteDocumentStore(file);
    let recovered = 0;
    for (const [id, content] of Object.entries(expected)) {
      if (w2.get(id) === content) recovered++;
    }
    expect(recovered).toBe(N); // 0 lost edits, 0 lost docs
    expect(w2.count()).toBe(N);
    w2.close();
  });

  it("does not evict old documents (LRU cap removed)", () => {
    const store = new SqliteDocumentStore(file);
    for (let i = 0; i < 150; i++) store.set(`d${i}`, String(i)); // > old MAX_DOCUMENTS=100
    expect(store.count()).toBe(150);
    expect(store.get("d0")).toBe("0"); // oldest still present
    store.close();
  });
});
