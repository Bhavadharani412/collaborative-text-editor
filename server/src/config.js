/**
 * Issue #1 — Environment configuration (dotenv, production-safe loading).
 *
 * Loads `.env` from the server root, validates variables, and exports a
 * frozen config object. In production it FAILS FAST with a clear message
 * if a critical variable is missing or malformed.
 */
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: process.env.ENV_FILE || path.join(__dirname, "..", ".env") });

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`[config] Invalid ${name}="${raw}" — expected a positive integer.`);
  }
  return n;
}

const config = {
  env: NODE_ENV,
  isProd,
  PORT: int("PORT", 3001),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  DB_PATH: process.env.DB_PATH
    ? path.resolve(__dirname, "..", process.env.DB_PATH)
    : path.join(__dirname, "..", "data", "collab.sqlite"),
  MAX_DOC_SIZE: int("MAX_DOC_SIZE", 1024 * 1024), // 1 MB payload cap
  CHUNK_SIZE: int("CHUNK_SIZE", 64 * 1024), // 64KB transfer chunks
  SAVE_DEBOUNCE_MS: int("SAVE_DEBOUNCE_MS", 1000),
  LOG_LEVEL: process.env.LOG_LEVEL || (isProd ? "info" : "debug"),
  // Reserved for upcoming issues (#8 auth, #15 Redis):
  JWT_SECRET: process.env.JWT_SECRET || null,
  REDIS_URL: process.env.REDIS_URL || null,
};

/* Production-safe checks: refuse to boot with unsafe defaults. */
if (isProd) {
  const problems = [];
  if (!process.env.JWT_SECRET) problems.push("JWT_SECRET");
  if (config.CLIENT_ORIGIN.includes("localhost"))
    problems.push("CLIENT_ORIGIN (must not be localhost in production)");
  if (problems.length) {
    throw new Error(
      `[config] Missing/invalid production settings: ${problems.join(", ")}. ` +
        "Set them in .env before deploying."
    );
  }
}

module.exports = Object.freeze(config);
