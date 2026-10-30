# 🗂️ CollabEdit — Maturity Roadmap & Kanban Board

> Goal: move the repo from **Level 0 (prototype, 3.5/10)** → **Level 2 (production-quality collaborative SaaS)**.
> Priorities use P0 (Critical) → P3 (Low). Work top-to-bottom; each issue lists its measurable acceptance criteria.

**Legend:** `☐ TODO` · `🔧 IN PROGRESS` · `✅ DONE`

---

## 🔖 Backlog (Kanban)

| # | Priority | Status | Issue | Epic | Effort |
|---|----------|--------|-------|------|--------|
| 1 | P0 🔥 | ☐ TODO | Add dotenv config + `.env.example` + production-safe env loading | Config | S |
| 2 | P0 🔥 | ☐ TODO | Structured logging (pino) with request/connection metadata | Ops | S |
| 3 | P0 🔥 | ☐ TODO | Strict input validation: docId format/length + payload schema checks | Security | M |
| 4 | P0 🔥 | ☐ TODO | Persistent document store (SQLite via better-sqlite3; Postgres-ready abstraction) | Persistence | M |
| 5 | P0 🔥 | ☐ TODO | Restart-survival test: create N docs → restart server → 0 lost docs/edits | Persistence | S |
| 6 | P0 🔥 | ☐ TODO | Server test suite (Vitest + socket.io-client): room join/save/sync/validation ≥80% coverage | Testing | M |
| 7 | P0 🔥 | ☐ TODO | CI pipeline (GitHub Actions: install → lint → build → test both workspaces) | Testing | S |
| 8 | P1 | ☐ TODO | Authentication: email/password + JWT, user identity in awareness | Auth | L |
| 9 | P1 | ☐ TODO | Authorization: reject unauthenticated `join-document` (100% blocked), token verified on socket handshake | Auth | M |
| 10 | P1 | ☐ TODO | Document ownership + metadata (creator, createdAt, updatedAt, lastEditedBy) | Data model | M |
| 11 | P1 | ☐ TODO | Roles & permissions: owner / editor / viewer, room ACL checks | Auth | L |
| 12 | P1 | ☐ TODO | Rate limiting: per-IP + per-user REST limits, WebSocket flood protection | Security | M |
| 13 | P1 | ☐ TODO | Multi-user e2e collaboration tests (3 concurrent editors, final-state equality, <100ms p95 propagation) | Testing | M |
| 14 | P1 | ☐ TODO | `/health` upgrade: DB connectivity check, latency budget p95 < 200ms | Ops | S |
| 15 | P2 | ☐ TODO | Redis pub/sub sync layer → horizontal scaling (multi-instance, 1000 concurrent users, p95 sync < 500ms) | Scale | XL |
| 16 | P2 | ☐ TODO | Document history/versioning: revisions + rollback + snapshot restore | Features | L |
| 17 | P2 | ☐ TODO | Server-managed document list (replace localStorage-only listing, cross-device sync) | Data model | M |
| 18 | P2 | ☐ TODO | Reconnect/recovery hardening: heartbeat audit, transport restriction, 99.9% recovery, no stale snapshots | Reliability | M |
| 19 | P2 | ☐ TODO | Fix React StrictMode ghost-collaborator avatars (provider singleton / cleanup) | Client | S |
| 20 | P2 | ☐ TODO | Presence UX: profiles, avatars, active-users list, named cursors | Features | M |
| 21 | P3 | ☐ TODO | Persistent search + indexing, folders/tags | Features | M |
| 22 | P3 | ☐ TODO | Notifications: "X edited this doc", join/leave events | Features | M |
| 23 | P3 | ☐ TODO | Admin dashboard: active rooms/users, sync latency, storage health | Ops | L |
| 24 | P3 | ☐ TODO | Audit log: who edited what and when | Ops | M |
| 25 | P3 | ☐ TODO | Advanced collab: comments, mentions, suggestions, version compare, share links w/ permissions | Features | XL |
| 26 | P3 | ☐ TODO | Production deployment: Docker Compose (app+DB+Redis), migrations, monitoring/alerting | Ops | L |

---

## 📌 Issue details (acceptance criteria)

### P0 — Critical foundation (must-do before anything else)

**#1 — dotenv & env config**
- As a operator I need config via `.env` so secrets never live in code.
- AC: `dotenv` loaded; `.env.example` documents every var (`PORT`, `CLIENT_ORIGIN`, `DB_PATH`, later `JWT_SECRET`, `REDIS_URL`); missing prod-critical vars fail fast with clear error.

**#2 — Structured logging**
- AC: JSON logs (pino) with timestamps, levels, module tags, socket IDs, doc IDs; 95%+ of server actions/errors logged with metadata; replaces all `console.*`.

**#3 — Input validation**
- AC: docId must match `^[a-zA-Z0-9_-]{1,64}$` (rejects 100% of fuzzed/oversized/malicious IDs); `save-document` payload size capped (e.g. ≤1 MB) and type-checked; invalid input returns error event, never crashes or stores.

**#4 — Real persistence layer**
- AC: SQLite file DB (better-sqlite3) behind a small `DocumentStore` interface (`get/set/delete/list`) so Postgres can be swapped in later; writes debounced; LRU eviction replaced by durable storage; 0 data loss across graceful shutdown.

**#5 — Restart-survival test**
- AC: automated test creates N docs, saves content, restarts server process, verifies 100% present with identical content.

**#6 — Server unit/integration tests**
- AC: Vitest; covers store, validation, room join/leave, save/load, chunking; ≥80% coverage on sync/validation logic; `npm test` exits 0.

**#7 — CI**
- AC: GitHub Actions runs server tests + client lint/build on PR to main; failures block merge.

### P1 — Trust & quality

**#8/#9 — AuthN + AuthZ**: bcrypt password hashing, JWT access tokens, socket handshake auth middleware; unauthenticated `join-document` success rate = 0; user identity visible in presence/awareness.
**#10 — Ownership/metadata**: every doc row has creator/timestamps/lastEditedBy; exposed via REST API.
**#11 — RBAC**: owner/editor/viewer enforced server-side on join + edits; viewer join cannot emit changes (100% rejected).
**#12 — Rate limiting**: express-rate-limit on REST; per-socket message budget (e.g. ≤50 msg/s) with kick on sustained abuse; blocks >99% of burst requests in test.
**#13 — E2E collab tests**: 3 simulated clients type concurrently for a window; final states converge identically; propagation p95 < 100 ms locally.
**#14 — Health upgrade**: `/health` checks DB ping; adds `/metrics`-style stats (rooms, sockets, uptime).

### P2/P3 — Scale & product features
(As tabled above; each gets its own detailed ticket when we start it.)

---

## 🚦 Suggested execution order
Batch A (P0): **#1 → #2 → #3 → #4 → #5 → #6 → #7** — one PR each, merged incrementally.
Batch B (P1): **#8 → #9 → #10 → #11 → #12 → #14 → #13**.
Batch C (P2): #15–#20. Batch D (P3): #21–#26.
