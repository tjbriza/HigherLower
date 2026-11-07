import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const source = await readFile("lib/api/monthlyListenersSnapshot.ts", "utf8");
const transpiled = spawnSync("node", ["-e", `const ts=require('typescript');process.stdout.write(ts.transpileModule(${JSON.stringify(source)}, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)`], { encoding: "utf8" });
assert.equal(transpiled.status, 0, transpiled.stderr);
const moduleSource = transpiled.stdout.replace('require("server-only");', "");
const { runInNewContext } = await import("node:vm");
const exports = {};
runInNewContext(`(function(exports,require,module){${moduleSource}\n})(exports,require,module)`, {
  exports,
  require: (name) => name === "server-only" ? {} : name === "node:fs" ? require("node:fs") : name === "node:path" ? require("node:path") : name === "@/types/api" ? { ApiFetchError: class ApiFetchError extends Error { constructor(source, statusCode, message) { super(message); this.source = source; this.statusCode = statusCode; } } } : {},
  module: { exports },
});

const now = Date.parse("2026-01-15T00:00:00Z");
const createSnapshot = (generatedAgeMs, collectedAgeMs) => ({
  version: 1,
  category: "monthly-listeners",
  generatedAt: new Date(now - generatedAgeMs).toISOString(),
  collectedAt: new Date(now - collectedAgeMs).toISOString(),
  source: "test",
  items: [0, 1].map((value) => ({
    id: `00000000-0000-0000-0000-00000000000${value}`,
    name: `Artist ${value}`,
    imageUrl: "https://example.test/image.jpg",
    value,
    displayValue: `${value} monthly listeners`,
  })),
});
const DAY = 86_400_000;
const fresh = exports.parseMonthlyListenersSnapshot(createSnapshot(0, 0), now);
assert.equal(exports.monthlyListenersFreshnessWarning(fresh, now), null);
const generationWarning = exports.parseMonthlyListenersSnapshot(createSnapshot(8 * DAY, 9 * DAY), now);
assert.match(exports.monthlyListenersFreshnessWarning(generationWarning, now), /freshness warning/);
const collectionWarning = exports.parseMonthlyListenersSnapshot(createSnapshot(8 * DAY, 9 * DAY), now);
assert.match(exports.monthlyListenersFreshnessWarning(collectionWarning, now), /collection age 9 days/);
assert.doesNotThrow(() => exports.parseMonthlyListenersSnapshot(createSnapshot(14 * DAY, 14 * DAY), now));
assert.throws(() => exports.parseMonthlyListenersSnapshot(createSnapshot(14 * DAY + 1, 14 * DAY), now), /14-day hard-stale limit/);
assert.throws(() => exports.parseMonthlyListenersSnapshot(createSnapshot(1 * DAY, 14 * DAY + 1), now), /14-day hard-stale limit/);
assert.throws(() => exports.parseMonthlyListenersSnapshot({ ...createSnapshot(0, 0), collectedAt: "invalid" }, now), /14-day hard-stale limit/);
assert.throws(() => exports.parseMonthlyListenersSnapshot({ ...createSnapshot(0, 0), collectedAt: new Date(now + 1).toISOString() }, now), /14-day hard-stale limit/);
assert.throws(() => exports.parseMonthlyListenersSnapshot({ ...createSnapshot(0, 1), collectedAt: new Date(now + 1).toISOString() }, now), /14-day hard-stale limit/);
console.log("Monthly snapshot freshness checks passed.");
