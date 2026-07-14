# Server — Collaborative Docs Signalling Server

> Node.js + Express + Socket.IO backend for the Collaborative Docs editor.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io&logoColor=white)

---

## Overview

This server is a **unified backend** that hosts:
- Express REST API and health checks (port 3001)
- Socket.IO server on `/socket.io` for coarse-grained document metadata events (join, save)
- Yjs WebSocket server on `/yjs` for real-time conflict-free CRDT document updates

**This server handles:**
- Handling `/yjs` WebSocket upgrade requests to sync live doc content
- Tracking document snapshots in memory (in-memory `documents` map, LRU capped at 100)
- Relaying coarse-grained socket events (join, save, broadcast changes) via Socket.IO
- Exposing a `/health` REST endpoint for uptime and document count monitoring
- CORS restricted to the frontend origin (configurable via env var)
- Graceful shutdown on `SIGTERM` / `SIGINT`

```
                          Browser
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   Socket.IO /socket.io              Yjs WebSocket /yjs
            │                                 │
            └────────────────┬────────────────┘
                             ▼
                 Unified Express / HTTP Server
                          (Port 3001)
```

---

## 📁 File Structure

```
server/
├── index.js       # Full server — all logic lives here
└── package.json   # Dependencies and scripts
```

### `index.js` — annotated

```
Configuration
  PORT             = process.env.PORT || 3001
  CLIENT_ORIGIN    = process.env.CLIENT_ORIGIN || "http://localhost:5173"
  MAX_DOCUMENTS    = 100

Express app
  GET /health      → { status, documents, uptime }

Socket.IO events (per socket)
  join-document    → leave old room, join new room, emit "load-document"
  send-changes     → broadcast delta to room (excluding sender)
  save-document    → persist snapshot in memory (triggers LRU eviction if > 100 docs)
  disconnect       → logged

LRU document store
  storeDocument(docId, content)
    - tracks insertion order in documentOrder[]
    - evicts oldest doc when cap is exceeded

Graceful shutdown
  SIGTERM / SIGINT → server.close() → process.exit(0)
  5 s timeout      → force process.exit(1)
```

---

## 🔌 Dependencies

| Package | Version | Purpose |
|---|---|---|
| `express` | 5 | HTTP server and routing |
| `socket.io` | 4 | WebSocket abstraction with rooms |
| `cors` | 2 | CORS middleware |
| `ws` | 8 | Raw WebSocket (transitive dep) |
| `yjs` | 13 | Yjs CRDT shared types |
| `y-websocket` | 1 | WebSocket provider utilities for Yjs |

---

## 🚀 Getting Started

```bash
# From the repository root
cd server
npm install
npm run dev      # node --watch (auto-restart on file changes)
# or
npm start        # plain node index.js
```

The server starts on **http://localhost:3001**. Yjs clients connect to WebSocket at `ws://localhost:3001/yjs`.

---

## 🔧 Available Scripts

| Script | Command | Description |
|---|---|---|
| Start | `npm start` | `node index.js` — production |
| Dev | `npm run dev` | `node --watch index.js` — auto-restart |

---

## 🌍 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | TCP port the server listens on |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin (frontend URL) |

Create an optional `.env` file:

```env
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
```

> **Note:** The server uses `process.env.*` directly — no dotenv package is installed.
> If you add a `.env` file, install `dotenv` and add `require('dotenv').config()` at the
> top of `index.js`, or use Node.js `--env-file` flag (Node 20.6+):
> ```bash
> node --env-file=.env index.js
> ```

---

## 📡 Socket.IO Event Reference

### Events the server listens for

| Event | Payload | What happens |
|---|---|---|
| `join-document` | `docId: string` | Leaves previous room, joins `docId` room, emits `load-document` with stored snapshot |
| `send-changes` | `delta: any` | Broadcasts delta to all other sockets in the same document room |
| `save-document` | `content: string` | Stores content snapshot in memory; evicts oldest doc if over 100-doc cap |

### Events the server emits

| Event | To | Payload | When |
|---|---|---|---|
| `load-document` | Requesting socket | `string` (document content) | After `join-document` |
| `receive-changes` | Room (excluding sender) | `delta` | After `send-changes` |
| `error` | Requesting socket | `{ message }` | On invalid input (e.g. missing/invalid `docId`) |

---

## 🏥 Health Endpoint

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "documents": 3,
  "uptime": 42.17
}
```

Use this for Docker health checks, load balancer probes, or uptime monitors.

---

## 🔒 Security Notes

| Concern | Current approach | Recommendation for production |
|---|---|---|
| CORS | Restricted to `CLIENT_ORIGIN` env var | Set to your exact production frontend URL |
| Document IDs | Accepted as-is from client | Validate format / length to prevent abuse |
| No auth | Any client can join any document room | Add JWT / session auth and room-level ACL |
| In-memory storage | Resets on every restart | Replace with Redis or a database |
| Socket.IO transport | Default (polling + WebSocket upgrade) | Force WebSocket-only in production: `transports: ['websocket']` |

---

## 🐳 Docker (optional)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY index.js .
ENV PORT=3001
EXPOSE 3001
CMD ["node", "index.js"]
```

Build and run:

```bash
docker build -t collab-docs-server .
docker run -p 3001:3001 -e CLIENT_ORIGIN=https://yourdomain.com collab-docs-server
```

---

## 🚧 Known Limitations

- **In-memory only** — all document snapshots are lost on server restart. Use Redis or
  PostgreSQL for persistence in production.
- **Single process** — the in-memory `documents` map is not shared across worker
  processes or multiple server instances. Use Redis pub/sub or a shared store for
  horizontal scaling.
- **No authentication** — any client with the correct socket URL can join any document
  room. Implement JWT middleware before production.
- **In-memory snapshots** — Socket.IO metadata & snapshots live in memory and are lost on server restart. In production, persistent storage should be used.

---

## 📄 Related

- [Root README](../README.md) — full project overview, architecture, setup guide
- [Client README](../client/README.md) — React + Vite frontend
