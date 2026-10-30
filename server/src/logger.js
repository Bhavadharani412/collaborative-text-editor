/**
 * Issue #2 — Structured logging (pino).
 *
 * JSON logs with timestamps and levels in production; human-readable via
 * pino-pretty in development. Every module gets a child logger tagged with
 * its name, and socket/doc metadata can be attached per log line.
 */
const pino = require("pino");
const config = require("./config");

const baseOptions = {
  level: config.LOG_LEVEL,
  base: { env: config.env },
};

/* Pretty output only in development (keeps prod logs machine-parseable). */
if (!config.isProd && process.env.PINO_PRETTY !== "0") {
  baseOptions.transport = {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname,env" },
  };
}

const root = pino(baseOptions);

/** Get a namespaced child logger, e.g. logger("store").info({ docId }, "msg") */
function logger(module) {
  return root.child({ module });
}

logger.root = root;

module.exports = logger;
