/**
 * Issue #5 — Real process-restart test: boots the actual server (index.js)
 * as a child process over a temp SQLite file, writes N documents through
 * real sockets, SIGTERMs it (graceful shutdown), restarts, and verifies
 * 100% of documents recover with identical content.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { io: ioClient } = require("socket.io-client");

const PORT = 3100 + Math.floor(Math.random() * 200);
const URL = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "collab-restart-"));
const dbFile = path.join(dir, "docs.sqlite");

const env = {
  ...process.env,
  PORT: String(PORT),
  DB_PATH: dbFile,
  PINO_PRETTY: "0",
  LOG_LEVEL: "silent",
};

function boot() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "index.js")], { env });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server boot timeout")), 8000);
    const check = () => {
      const req = require("node:http").get(`${URL}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) { clearTimeout(t); resolve(child); }
        else setTimeout(check, 200);
      });
      req.on("error", () => setTimeout(check, 200));
    };
    child.on("exit", (code) => reject(new Error(`server exited early (${code})`)));
    check();
  });
}

function writeDocs(docs) {
  return new Promise((resolve, reject) => {
    const s = ioClient(URL, { transports: ["websocket"] });
    const done = [];
    s.on("connect_error", reject);
    s.on("connect", async () => {
      for (const [id, content] of Object.entries(docs)) {
        s.emit("join-document", id);
        await new Promise((r) => s.once("load-document", r));
        s.emit("save-document", content);
        done.push(id);
      }
      // give the store a beat, then close cleanly
      await new Promise((r) => setTimeout(r, 100));
      s.close();
      resolve(done);
    });
  });
}

function readDoc(id) {
  return new Promise((resolve, reject) => {
    const s = ioClient(URL, { transports: ["websocket"] });
    s.on("connect_error", reject);
    s.on("connect", () => {
      s.once("load-document", (content) => { s.close(); resolve(content); });
      s.emit("join-document", id);
    });
  });
}

async function stop(child) {
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
}

test("N docs survive a real server restart (graceful SIGTERM)", async () => {
  const docs = {};
  for (let i = 0; i < 10; i++) docs[`restart_doc_${i}`] = `<p>survives reboot ${i}</p>`;

  // Boot #1 → write → graceful shutdown
  let server = await boot();
  await writeDocs(docs);
  await stop(server);

  // Boot #2 over the SAME db file → read everything back
  server = await boot();
  try {
    for (const [id, content] of Object.entries(docs)) {
      assert.equal(await readDoc(id), content, `doc ${id} lost after restart`);
    }
    const health = await new Promise((res) =>
      require("node:http").get(`${URL}/health`, (r) => {
        let raw = ""; r.on("data", (c) => (raw += c)); r.on("end", () => res(JSON.parse(raw)));
      })
    );
    assert.equal(health.store, "ok");
    assert.ok(health.documents >= 10);
  } finally {
    await stop(server);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
