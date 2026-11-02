import { readFile, rename, unlink, writeFile } from "node:fs/promises";

const METRICS_PATH = "lib/api/data/twitch-followers-metrika.snapshot.json";
const ROSTER_PATH = "lib/api/data/twitch-owner-review-roster.json";
const OUTPUT_PATH = "lib/api/data/twitch-followers.snapshot.json";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function validateMetrics(metrics, now = Date.now()) {
  if (!metrics || metrics.version !== 1 || typeof metrics.source !== "string" ||
    typeof metrics.generatedAt !== "string" || !Array.isArray(metrics.records)) throw new Error("Metrika snapshot schema invalid.");
  const generatedAt = Date.parse(metrics.generatedAt);
  if (!Number.isFinite(generatedAt) || generatedAt > now || now - generatedAt > MAX_AGE_MS) throw new Error("Metrika snapshot invalid or hard-stale.");
  const ids = new Set();
  const logins = new Set();
  for (const record of metrics.records) {
    if (!record || !/^[a-z0-9_]{1,25}$/.test(record.login) || record.id !== `twitch:${record.login}` ||
      ids.has(record.id) || logins.has(record.login) || !Number.isSafeInteger(record.followerCount) || record.followerCount < 0 ||
      typeof record.collectedAt !== "string" || !Number.isFinite(Date.parse(record.collectedAt)) ||
      Object.keys(record).some((key) => !["id", "login", "followerCount", "collectedAt"].includes(key))) throw new Error("Metrika record invalid.");
    ids.add(record.id);
    logins.add(record.login);
  }
  if (metrics.records.length !== 200) throw new Error("Expected exactly 200 durable Metrika records.");
  return metrics;
}

function validateRoster(roster) {
  if (!roster || roster.version !== 1 || roster.sourceOrigin !== "helix-discovery-review-seed" || !Array.isArray(roster.items)) throw new Error("Review roster provenance/schema invalid.");
  const ids = new Set();
  const logins = new Set();
  for (const item of roster.items) {
    if (!item || !/^[a-z0-9_]{1,25}$/.test(item.login) || item.id !== `twitch:${item.login}` || ids.has(item.id) || logins.has(item.login) ||
      typeof item.displayLabel !== "string" || !item.displayLabel.trim() || item.sourceOrigin !== "helix-discovery-review-seed" ||
      !["pendingReview", "ownerApproved", "rejected"].includes(item.status) ||
      Object.keys(item).some((key) => !["id", "login", "displayLabel", "sourceOrigin", "status"].includes(key))) throw new Error("Review roster item invalid.");
    ids.add(item.id);
    logins.add(item.login);
  }
  if (roster.items.length !== 200) throw new Error("Expected 200 owner review seeds.");
  return roster;
}

const [metricsInput, rosterInput] = await Promise.all([
  readFile(METRICS_PATH, "utf8").then(JSON.parse),
  readFile(ROSTER_PATH, "utf8").then(JSON.parse),
]);
const metrics = validateMetrics(metricsInput);
const roster = validateRoster(rosterInput);
const metricByLogin = new Map(metrics.records.map((record) => [record.login, record]));
const approved = roster.items.filter((item) => item.status === "ownerApproved");
const usedLogins = new Set();
const items = approved.flatMap((item) => {
  const metric = metricByLogin.get(item.login);
  if (!metric || metric.id !== item.id || usedLogins.has(item.login)) return [];
  usedLogins.add(item.login);
  return [{ id: item.id, name: item.displayLabel, imageUrl: "/twitch-generic.svg", value: metric.followerCount,
    displayValue: `${metric.followerCount.toLocaleString("en-US")} followers` }];
});
const output = { version: 1, category: "twitch-followers", generatedAt: new Date().toISOString(),
  collectedAt: new Date(metrics.records.reduce((oldest, record) => Date.parse(record.collectedAt) < oldest ? Date.parse(record.collectedAt) : oldest, Infinity)).toISOString(),
  source: metrics.source, items };
if (!items.length && approved.length) throw new Error("No approved roster records match durable metrics.");
const tempPath = `${OUTPUT_PATH}.${process.pid}.tmp`;
try {
  await writeFile(tempPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const reread = JSON.parse(await readFile(tempPath, "utf8"));
  if (reread.items.length !== items.length || reread.items.some((item) => item.imageUrl !== "/twitch-generic.svg")) throw new Error("Generated Twitch output failed read-back.");
  await rename(tempPath, OUTPUT_PATH);
} catch (error) {
  await unlink(tempPath).catch(() => undefined);
  throw error;
}
console.log(JSON.stringify({ metricRecords: metrics.records.length, pendingReview: roster.items.filter((item) => item.status === "pendingReview").length,
  ownerApproved: approved.length, runtimeItems: items.length }));
