/**
 * Issue #6 — Socket integration tests: real server + real socket.io clients.
 * Covers room join/leave, save/load round-trip through the durable store,
 * broadcast sync between clients (with no cross-room leakage), validation
 * rejections, chunked transfer of large documents, and /health.
 */
const { describe, it, before, after } = require("node:test");
const { expect } = require("./helpers.cjs");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("node:http");
const { io: ioClient } = require("socket.io-client");

process.env.PINO_PRETTY = "0";
process.env.LOG_LEVEL = "silent";
const { SqliteDocumentStore } = require("../src/store");
const { createApp } = require("../src/app");

let store, ctx, baseUrl, dir;

function connect() {
  return new Promise((resolve, reject) => {
    const s = ioClient(baseUrl, { transports: ["websocket"], forceNew: true });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
    setTimeout(() => reject(new Error("connect timeout")), 3000).unref?.();
  });
}

const once = (socket, event, ms = 2000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
    socket.once(event, (data) => { clearTimeout(t); resolve(data); });
  });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "collab-sock-"));
  store = new SqliteDocumentStore(path.join(dir, "docs.sqlite"));
  ctx = createApp({ store });
  await new Promise((r) => ctx.server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${ctx.server.address().port}`;
});

after(async () => {
  await ctx.close();
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("/health", () => {
  it("returns ok with durable store status", async () => {
    const body = await new Promise((resolve, reject) => {
      http.get(`${baseUrl}/health`, (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => resolve(JSON.parse(raw)));
      }).on("error", reject);
    });
    expect(body.status).toBe("ok");
    expect(body.store).toBe("ok");
    expect(typeof body.documents).toBe("number");
  });
});

describe("join-document", () => {
  it("loads empty content for a brand-new valid doc", async () => {
    const s = await connect();
    s.emit("join-document", "new_doc_1");
    expect(await once(s, "load-document")).toBe("");
    s.close();
  });

  it("rejects invalid docIds with an error event and never stores them", async () => {
    const s = await connect();
    for (const bad of ["", "__proto__", "<script>", "a".repeat(65), "../x", 42]) {
      const errP = once(s, "error");
      s.emit("join-document", bad);
      const err = await errP;
      expect(err.message).toBe("Invalid document ID");
    }
    expect(store.get("__proto__")).toBeUndefined();
    s.close();
  });

  it("switching docs leaves the previous room", async () => {
    const s = await connect();
    s.emit("join-document", "roomA");
    await once(s, "load-document");
    s.emit("join-document", "roomB");
    await once(s, "load-document");
    const roomA = ctx.io.of("/").adapter.rooms.get("roomA");
    expect(roomA ? [...roomA].includes(s.id) : false).toBe(false);
    s.close();
  });
});

describe("save-document + reload (persistence path)", () => {
  it("round-trips saved content on a later join", async () => {
    const s1 = await connect();
    s1.emit("join-document", "persist_doc");
    await once(s1, "load-document");
    s1.emit("save-document", "<p>durable hello</p>");
    await wait(50);
    expect(store.get("persist_doc")).toBe("<p>durable hello</p>");
    s1.close();

    const s2 = await connect();
    s2.emit("join-document", "persist_doc");
    expect(await once(s2, "load-document")).toBe("<p>durable hello</p>");
    s2.close();
  });

  it("rejects oversized payloads and leaves stored doc unchanged", async () => {
    const s = await connect();
    s.emit("join-document", "valid_id");
    await once(s, "load-document");
    const errP = once(s, "error");
    s.emit("save-document", "x".repeat(2 * 1024 * 1024)); // > MAX_DOC_SIZE (1MB)
    const err = await errP;
    expect(err.message).toBe("Invalid document payload");
    expect(store.get("valid_id")).toBe("");
    s.close();
  });

  it("ignores saves from sockets that never joined a room", async () => {
    const beforeCount = store.count();
    const s = await connect();
    s.emit("save-document", "<p>sneaky</p>");
    await wait(50);
    expect(store.count()).toBe(beforeCount); // nothing created out of thin air
    s.close();
  });
});

describe("send-changes broadcast (sync correctness)", () => {
  it("delivers deltas to other clients in the same room only", async () => {
    const [a, b, c] = await Promise.all([connect(), connect(), connect()]);
    for (const s of [a, b]) {
      s.emit("join-document", "sync_room");
      await once(s, "load-document");
    }
    c.emit("join-document", "other_room");
    await once(c, "load-document");

    const gotB = once(b, "receive-changes");
    const leakWatch = new Promise((res) => {
      c.on("receive-changes", () => res("LEAK"));
      setTimeout(() => res("none"), 300);
    });

    a.emit("send-changes", { ops: [{ insert: "hi" }] });
    expect(await gotB).toEqual({ ops: [{ insert: "hi" }] });
    expect(await leakWatch).toBe("none"); // no cross-room leakage
    [a, b, c].forEach((s) => s.close());
  });

  it("rejects malformed deltas", async () => {
    const [a, b] = await Promise.all([connect(), connect()]);
    a.emit("join-document", "delta_room");
    await once(a, "load-document");
    b.emit("join-document", "delta_room");
    await once(b, "load-document");

    const errP = once(a, "error");
    a.emit("send-changes", { nope: true });
    expect((await errP).message).toBe("Invalid change payload");
    [a, b].forEach((s) => s.close());
  });

  it("propagates within <100ms p95 locally", async () => {
    const [a, b] = await Promise.all([connect(), connect()]);
    a.emit("join-document", "lat_room");
    await once(a, "load-document");
    b.emit("join-document", "lat_room");
    await once(b, "load-document");

    const latencies = [];
    for (let i = 0; i < 20; i++) {
      const t0 = Date.now();
      const p = once(b, "receive-changes", 1000);
      a.emit("send-changes", { ops: [{ insert: String(i) }] });
      await p;
      latencies.push(Date.now() - t0);
    }
    latencies.sort((x, y) => x - y);
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    expect(p95).toBeLessThan(100);
    [a, b].forEach((s) => s.close());
  });
});

describe("chunked transfer of large documents", () => {
  it("streams >CHUNK_SIZE docs as start/chunk sequence", async () => {
    const big = "A".repeat(70 * 1024); // > 64KB default chunk size → 2 chunks
    store.set("big_doc", big);

    const s = await connect();
    const chunksP = new Promise((resolve) => {
      let assembled = "";
      let count = 0;
      s.on("load-document-chunk", (msg) => {
        assembled += msg.chunk;
        count++;
        if (msg.isLast) resolve({ assembled, count });
      });
    });
    const startP = once(s, "load-document-start");
    s.emit("join-document", "big_doc");

    const start = await startP;
    expect(start.totalChunks).toBe(2);
    expect(start.totalSize).toBe(big.length);

    const { assembled, count } = await chunksP;
    expect(count).toBe(2);
    expect(assembled).toBe(big);
    s.close();
  });
});
