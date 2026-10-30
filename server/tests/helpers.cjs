/**
 * Tiny expect() shim so tests read like Jest/Vitest while running on the
 * built-in node:test runner (zero extra dependencies, CJS-friendly).
 */
const assert = require("node:assert/strict");

function build(actual, negated) {
  return {
    toBe(expected) {
      if (negated) assert.notStrictEqual(actual, expected);
      else assert.strictEqual(actual, expected);
    },
    toEqual(expected) {
      if (negated) assert.notDeepStrictEqual(actual, expected);
      else assert.deepStrictEqual(actual, expected);
    },
    toBeUndefined() {
      if (negated) assert.notStrictEqual(actual, undefined);
      else assert.strictEqual(actual, undefined);
    },
    toBeLessThan(n) {
      if (negated) assert.ok(!(actual < n));
      else assert.ok(actual < n, `expected ${actual} < ${n}`);
    },
    toBeGreaterThan(n) {
      if (negated) assert.ok(!(actual > n));
      else assert.ok(actual > n, `expected ${actual} > ${n}`);
    },
    includes(v) {
      const has = Array.isArray(actual) ? actual.includes(v) : String(actual).includes(v);
      if (negated) assert.ok(!has, `did not expect ${JSON.stringify(actual)} to include ${JSON.stringify(v)}`);
      else assert.ok(has, `expected ${JSON.stringify(actual)} to include ${JSON.stringify(v)}`);
    },
    get not() {
      return build(actual, !negated);
    },
  };
}

function expect(actual, msg) {
  const e = build(actual, false);
  if (msg !== undefined) e._msg = msg;
  return e;
}

module.exports = { expect };
