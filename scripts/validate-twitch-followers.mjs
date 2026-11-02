import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const dataPath = "lib/api/data/";
const [summary, originalResults, metrics, roster, discovery, runtimeSnapshot, reader, generator, availability, dispatcher] = await Promise.all([
  readFile(`${dataPath}twitch-metrika-run-summary.json`, "utf8").then(JSON.parse),
  readFile(`${dataPath}twitch-metrika-results.json`, "utf8").then(JSON.parse),
  readFile(`${dataPath}twitch-followers-metrika.snapshot.json`, "utf8").then(JSON.parse),
  readFile(`${dataPath}twitch-owner-review-roster.json`, "utf8").then(JSON.parse),
  readFile(`${dataPath}twitch-stream-candidates.json`, "utf8").then(JSON.parse),
  readFile(`${dataPath}twitch-followers.snapshot.json`, "utf8").then(JSON.parse),
  readFile("lib/api/twitchFollowersSnapshot.ts", "utf8"),
  readFile("scripts/generate-twitch-followers-snapshot.mjs", "utf8"),
  readFile("lib/catalog/availability.ts", "utf8"),
  readFile("lib/api/index.ts", "utf8"),
]);

assert.equal(originalResults.records.length, 200);
assert.equal(originalResults.records.filter((record) => record.status === "available").length, 200);
assert.equal(summary.submitted, 200);
assert.equal(summary.returned, 200);
assert.equal(metrics.records.length, 200);
assert.equal(new Set(metrics.records.map((record) => record.login)).size, 200);
assert.equal(new Set(metrics.records.map((record) => record.id)).size, 200);
assert.equal(metrics.source, "Metrika Twitch account followers");
assert(Number.isFinite(Date.parse(metrics.generatedAt)));
assert(Number.isFinite(Date.parse(metrics.collectedAt)));
assert.equal(metrics.records.length, summary.validFollowerMetrics);
const oldValues = new Map(originalResults.records.map((record) => [record.login, record.value]));
for (const record of metrics.records) {
  assert.equal(record.id, `twitch:${record.login}`);
  assert.equal(record.followerCount, oldValues.get(record.login));
  assert(Number.isFinite(Date.parse(record.collectedAt)));
  assert.deepEqual(Object.keys(record).sort(), ["collectedAt", "followerCount", "id", "login"]);
}

const shortlisted = discovery.candidates.filter((item) => item.classification === "provisional_shortlist");
assert.equal(shortlisted.length, 200);
assert.equal(roster.sourceOrigin, "helix-discovery-review-seed");
assert.equal(roster.items.length, 200);
assert.equal(new Set(roster.items.map((item) => item.login)).size, 200);
for (const item of roster.items) {
  assert.equal(item.sourceOrigin, "helix-discovery-review-seed");
  assert(["pendingReview", "ownerApproved", "rejected"].includes(item.status));
  assert.equal(item.id, `twitch:${item.login}`);
  assert.equal(item.login, item.login.toLowerCase());
  assert(shortlisted.some((candidate) => candidate.login.toLowerCase() === item.login && candidate.displayName === item.displayLabel));
  assert.deepEqual(Object.keys(item).sort(), ["displayLabel", "id", "login", "sourceOrigin", "status"]);
}
assert.equal(runtimeSnapshot.items.length, 196);
assert.equal(runtimeSnapshot.source, metrics.source);
assert(runtimeSnapshot.items.every((item) => item.imageUrl === "/twitch-generic.svg"));
assert.equal(metrics.records.length, 200);
assert.equal(roster.items.filter((item) => item.status === "ownerApproved").length, 196);
assert.equal(roster.items.filter((item) => item.status === "rejected").length, 4);
assert.equal(roster.items.filter((item) => item.status === "pendingReview").length, 0);
const approvedLogins = new Set(roster.items.filter((item) => item.status === "ownerApproved").map((item) => item.login));
const rejectedLogins = new Set(roster.items.filter((item) => item.status === "rejected").map((item) => item.login));
assert.deepEqual([...rejectedLogins].sort(), ["cs2_maincast", "cs2_paragon_ru", "gronkhtv", "luzu_tv"]);
assert.equal(new Set(runtimeSnapshot.items.map((item) => item.id)).size, 196);
assert.deepEqual(new Set(runtimeSnapshot.items.map((item) => item.id)), new Set([...approvedLogins].map((login) => `twitch:${login}`)));
assert.deepEqual(Object.keys(runtimeSnapshot).sort(), ["category", "collectedAt", "generatedAt", "items", "source", "version"]);
for (const item of runtimeSnapshot.items) {
  assert.equal(item.imageUrl, "/twitch-generic.svg");
  assert(Number.isFinite(item.value));
  assert.equal(metrics.records.filter((record) => record.id === item.id && Number.isFinite(record.followerCount)).length, 1);
  assert.equal(item.value, metrics.records.find((record) => record.id === item.id).followerCount);
  assert.doesNotMatch(JSON.stringify(item), /helix|profileImageUrl|static-cdn\.jtvnw\.net/i);
}
assert(runtimeSnapshot.items.every((item) => !rejectedLogins.has(item.id.slice("twitch:".length))));
assert.match(reader, /status !== "ownerApproved"/);
assert.match(reader, /createTwitchAvatarDataUri\(login, candidate\.displayLabel\)/);
assert.doesNotMatch(reader, /twitch-stream-candidates|twitch-metrika-results|profileImageUrl|static-cdn\.jtvnw\.net/i);
assert.doesNotMatch(generator, /twitch-stream-candidates|twitch-metrika-results|profileImageUrl|static-cdn\.jtvnw\.net/i);
assert.match(generator, /ownerApproved/);
assert.match(availability, /"twitch-followers": \{\s*status: "released",\s*productionPlayable: true,\s*rationale:[\s\S]*?gates: \{[\s\S]*?"stable-semantic-identity": \{\s*satisfied: true[\s\S]*?"approved-metric-contract": \{\s*satisfied: true[\s\S]*?"valid-server-adapter": \{\s*satisfied: true[\s\S]*?"runtime-provider-evidence": \{\s*satisfied: true[\s\S]*?"server-route-authorization": \{\s*satisfied: true[\s\S]*?"public-catalog-eligibility": \{\s*satisfied: true[\s\S]*?"reversible-visibility": \{\s*satisfied: true/);
assert.match(dispatcher, /"twitch-followers": fetchTwitchFollowersFromSnapshot/);
assert.match(availability, /"twitch-followers": "twitch-followers"/);
assert.match(availability, /satisfied: true/);

const approved = { ...roster, items: [{ ...roster.items[0], status: "ownerApproved" }] };
const approvedMetric = { ...metrics, records: [metrics.records.find((record) => record.login === approved.items[0].login)] };
const avatarHelperSource = reader.slice(reader.indexOf("const AVATAR_PALETTE"), reader.indexOf("type MetricRecord"));
const avatarModule = { exports: {} };
const avatarContext = { exports: avatarModule.exports, module: avatarModule };
vm.runInNewContext(`${ts.transpileModule(`${avatarHelperSource}\nmodule.exports = { createTwitchAvatarDataUri };`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText}`, avatarContext);
const { createTwitchAvatarDataUri } = avatarModule.exports;
const fixtureResult = buildFixture(approvedMetric, approved);
for (const [login, name] of [["kungentv", "KungenTV"], ["strawberrytabby", "Strawberry Tabby"], ["short", "Q"], ["long", "A Very Long Display Name"]]) {
  const avatar = createTwitchAvatarDataUri(login, name);
  assert.equal(avatar, createTwitchAvatarDataUri(login, name));
  assert(avatar.startsWith("data:image/svg+xml,"));
  const svg = decodeURIComponent(avatar.slice("data:image/svg+xml,".length));
  assert.match(svg, /viewBox="0 0 256 256"/);
  assert.match(svg, /text-anchor="middle"/);
}
const escapedAvatar = decodeURIComponent(createTwitchAvatarDataUri("short", "&foo").slice("data:image/svg+xml,".length));
assert(escapedAvatar.includes("&amp;F"));
const runtimeAvatarUris = buildFixture(metrics, roster).items.map((item) => item.imageUrl);
assert(runtimeAvatarUris.length > 0);
assert(new Set(runtimeAvatarUris).size > 1, "Approved roster should produce distinct-looking avatars where possible.");
assert.equal(fixtureResult.items.length, 1);
assert.equal(fixtureResult.items[0].id, approved.items[0].id);
assert.equal(fixtureResult.items[0].name, approved.items[0].displayLabel);
assert(fixtureResult.items[0].imageUrl.startsWith("data:image/svg+xml,"));
assert.equal(fixtureResult.items[0].value, approvedMetric.records[0].followerCount);
assert.equal(buildFixture(metrics, roster).items.length, 196);

function buildFixture(metricData, rosterData) {
  const metricsByLogin = new Map(metricData.records.map((item) => [item.login, item]));
  return { items: rosterData.items.flatMap((item) => {
    if (item.status !== "ownerApproved") return [];
    const metric = metricsByLogin.get(item.login);
    return metric && metric.id === item.id ? [{ id: item.id, name: item.displayLabel, imageUrl: createTwitchAvatarDataUri(item.login, item.displayLabel), value: metric.followerCount }] : [];
  }) };
}

console.log("Twitch Option A data/schema/reconciliation/avatar determinism and approved-fixture validation passed.");
