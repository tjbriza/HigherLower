import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const dataPath = "lib/api/data/";
const avatarPath = `${dataPath}twitch-avatar-images.json`;
const CREDENTIAL_PATTERN = /client_secret|clientSecret|access_token|accessToken|Bearer\s|TWITCH_CLIENT_SECRET|TWITCH_CLIENT_ID/i;
const AVATAR_HOSTNAME = "static-cdn.jtvnw.net";

const [summary, originalResults, metrics, roster, discovery, reader, availability, dispatcher, packageJson, enrichment] = await Promise.all([
  readFile(`${dataPath}twitch-metrika-run-summary.json`, "utf8").then(JSON.parse),
  readFile(`${dataPath}twitch-metrika-results.json`, "utf8").then(JSON.parse),
  readFile(`${dataPath}twitch-followers-metrika.snapshot.json`, "utf8").then(JSON.parse),
  readFile(`${dataPath}twitch-owner-review-roster.json`, "utf8").then(JSON.parse),
  readFile(`${dataPath}twitch-stream-candidates.json`, "utf8").then(JSON.parse),
  readFile("lib/api/twitchFollowersSnapshot.ts", "utf8"),
  readFile("lib/catalog/availability.ts", "utf8"),
  readFile("lib/api/index.ts", "utf8"),
  readFile("package.json", "utf8").then(JSON.parse),
  readFile("scripts/enrich-twitch-profile-images.mjs", "utf8"),
]);

// D5: the derived runtime snapshot and its generator are retired, and nothing
// in package.json still invokes the generator.
await assert.rejects(readFile(`${dataPath}twitch-followers.snapshot.json`), (error) => error?.code === "ENOENT");
await assert.rejects(readFile("scripts/generate-twitch-followers-snapshot.mjs"), (error) => error?.code === "ENOENT");
assert(Object.values(packageJson.scripts ?? {}).every((value) => !String(value).includes("generate-twitch-followers-snapshot")));

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

assert.equal(metrics.records.length, 200);
assert.equal(roster.items.filter((item) => item.status === "ownerApproved").length, 196);
assert.equal(roster.items.filter((item) => item.status === "rejected").length, 4);
assert.equal(roster.items.filter((item) => item.status === "pendingReview").length, 0);
const approvedLogins = new Set(roster.items.filter((item) => item.status === "ownerApproved").map((item) => item.login));
const rejectedLogins = new Set(roster.items.filter((item) => item.status === "rejected").map((item) => item.login));
assert.deepEqual([...rejectedLogins].sort(), ["cs2_maincast", "cs2_paragon_ru", "gronkhtv", "luzu_tv"]);

assert.match(reader, /status !== "ownerApproved"/);
const flat = reader.replace(/\s+/g, " ");
assert.match(flat, /avatarUrl \?\? createTwitchAvatarDataUri\(login, candidate\.displayLabel\)/);
assert.match(flat, /imageUrl: avatarUrl \?\?/);
assert.equal(reader.split("createTwitchAvatarDataUri").length - 1, 2);
assert.doesNotMatch(reader, /twitch-stream-candidates|twitch-metrika-results/i);
assert.doesNotMatch(reader, /twitch-followers\.snapshot\.json|\/twitch-generic\.svg/);
assert.match(reader, /twitch-avatar-images\.json/);
assert.match(reader, /static-cdn\.jtvnw\.net/);

// Credential prohibitions: no credential-shaped text may appear in the reader
// or the avatar artifact. High-entropy patterns are deliberately avoided
// because CDN URLs carry UUID paths.
assert.doesNotMatch(reader, CREDENTIAL_PATTERN);
assert.doesNotMatch(enrichment, /(?:client_id|clientId|client_secret|clientSecret)\s*[:=]\s*["'][^"']{8,}["']/);
assert.doesNotMatch(enrichment, /console\.\w+\([^)]*(?:access_token|accessToken|clientSecret|clientId)/i);

const avatarHelperSource = reader.slice(reader.indexOf("const AVATAR_PALETTE"), reader.indexOf("type MetricRecord"));
const avatarModule = { exports: {} };
const avatarContext = { exports: avatarModule.exports, module: avatarModule };
vm.runInNewContext(`${ts.transpileModule(`${avatarHelperSource}\nmodule.exports = { createTwitchAvatarDataUri };`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText}`, avatarContext);
const { createTwitchAvatarDataUri } = avatarModule.exports;

let avatarArtifact = null;
try {
  avatarArtifact = JSON.parse(await readFile(avatarPath, "utf8"));
} catch (error) {
  assert.equal(error?.code, "ENOENT", "Avatar artifact must be absent (ENOENT) or valid JSON.");
  avatarArtifact = null;
}
let avatarStatus = "absent (identicon fallback only; artifact assertions [Not tested])";
const avatarMap = new Map();

if (avatarArtifact) {
  assert.equal(avatarArtifact.schemaVersion, 1);
  assert.deepEqual(
    Object.keys(avatarArtifact).sort(),
    ["batchCount", "endpoint", "entries", "generatedAt", "requestCap", "requestedIdentities", "returnedIdentities", "schemaVersion", "source"],
  );
  assert.equal(avatarArtifact.requestCap, 100);
  assert.equal(avatarArtifact.requestedIdentities, 196);
  assert.equal(avatarArtifact.batchCount, 2);
  const entryLogins = Object.keys(avatarArtifact.entries);
  assert.equal(avatarArtifact.returnedIdentities, entryLogins.length);
  assert(entryLogins.length > 0, "A present avatar artifact must contain at least one verified entry.");
  const verifiedAtCeiling = Date.now() + 60 * 60 * 1000;
  const discoveryByIdentity = new Map(discovery.candidates.map((candidate) => [String(candidate.login).toLowerCase(), candidate]));
  for (const login of entryLogins) {
    const entry = avatarArtifact.entries[login];
    assert.deepEqual(Object.keys(entry).sort(), ["displayName", "login", "profileImageUrl", "userId", "verifiedAt"]);
    assert.equal(entry.login, login);
    assert.match(login, /^[a-z0-9_]{1,25}$/);
    assert.match(entry.userId, /^\d+$/);
    assert.equal(typeof entry.displayName, "string");
    assert(entry.displayName.trim().length > 0);
    assert(Number.isFinite(Date.parse(entry.verifiedAt)));
    assert(Date.parse(entry.verifiedAt) <= verifiedAtCeiling, "verifiedAt must not be more than one hour in the future.");
    const avatarUrl = new URL(entry.profileImageUrl);
    assert.equal(avatarUrl.protocol, "https:");
    assert.equal(avatarUrl.hostname, AVATAR_HOSTNAME);
    assert(approvedLogins.has(login), "Every avatar entry must belong to an ownerApproved identity.");
    const candidate = discoveryByIdentity.get(login);
    if (candidate && /^\d+$/.test(String(candidate.userId))) {
      assert.equal(entry.userId, String(candidate.userId), "Avatar identity must match the discovered numeric user ID.");
    }
    avatarMap.set(login, entry.profileImageUrl);
  }
  assert.equal(new Set(Object.values(avatarArtifact.entries).map((entry) => entry.userId)).size, entryLogins.length);
  assert.doesNotMatch(JSON.stringify(avatarArtifact), CREDENTIAL_PATTERN);
  avatarStatus = `present (${entryLogins.length} verified URLs of 196)`;
}

const runtimeFixture = buildFixture(metrics, roster, avatarMap);
assert.equal(runtimeFixture.items.length, 196);
assert.equal(new Set(runtimeFixture.items.map((item) => item.id)).size, 196);
assert.deepEqual(new Set(runtimeFixture.items.map((item) => item.id)), new Set([...approvedLogins].map((login) => `twitch:${login}`)));
for (const item of runtimeFixture.items) {
  assert(Number.isFinite(item.value));
  assert.equal(metrics.records.filter((record) => record.id === item.id && Number.isFinite(record.followerCount)).length, 1);
  assert.equal(item.value, metrics.records.find((record) => record.id === item.id).followerCount);
  assert.equal(typeof item.imageUrl, "string");
  assert(item.imageUrl.length > 0);
  const isIdenticon = item.imageUrl.startsWith("data:image/svg+xml,");
  if (!isIdenticon) {
    const imageUrl = new URL(item.imageUrl);
    assert.equal(imageUrl.protocol, "https:");
    assert.equal(imageUrl.hostname, AVATAR_HOSTNAME);
    assert(avatarMap.has(item.id.slice("twitch:".length)));
  }
}
assert(runtimeFixture.items.every((item) => !rejectedLogins.has(item.id.slice("twitch:".length))));
assert.doesNotMatch(JSON.stringify(runtimeFixture.items), /helix/i);
if (!avatarArtifact) {
  assert(runtimeFixture.items.every((item) => item.imageUrl.startsWith("data:image/svg+xml,")));
  assert.equal(runtimeFixture.items.filter((item) => item.imageUrl.startsWith("data:image/svg+xml,")).length, 196);
}

assert.match(availability, /"twitch-followers": \{\s*status: "released",\s*productionPlayable: true,\s*rationale:[\s\S]*?gates: \{[\s\S]*?"stable-semantic-identity": \{\s*satisfied: true[\s\S]*?"approved-metric-contract": \{\s*satisfied: true[\s\S]*?"valid-server-adapter": \{\s*satisfied: true[\s\S]*?"runtime-provider-evidence": \{\s*satisfied: true[\s\S]*?"server-route-authorization": \{\s*satisfied: true[\s\S]*?"public-catalog-eligibility": \{\s*satisfied: true[\s\S]*?"reversible-visibility": \{\s*satisfied: true/);
assert.match(dispatcher, /"twitch-followers": fetchTwitchFollowersFromSnapshot/);
assert.match(availability, /"twitch-followers": "twitch-followers"/);
assert.match(availability, /satisfied: true/);

const approved = { ...roster, items: [{ ...roster.items[0], status: "ownerApproved" }] };
const approvedMetric = { ...metrics, records: [metrics.records.find((record) => record.login === approved.items[0].login)] };
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
assert(escapedAvatar.includes("&" + "amp;F"));
const identiconUris = buildFixture(metrics, roster).items.map((item) => item.imageUrl);
assert.equal(identiconUris.length, 196);
assert(identiconUris.every((uri) => uri.startsWith("data:image/svg+xml,")));
assert(new Set(identiconUris).size > 1, "Approved roster should produce distinct-looking identicons where possible.");
assert.equal(fixtureResult.items.length, 1);
assert.equal(fixtureResult.items[0].id, approved.items[0].id);
assert.equal(fixtureResult.items[0].name, approved.items[0].displayLabel);
assert(fixtureResult.items[0].imageUrl.startsWith("data:image/svg+xml,"));
assert.equal(fixtureResult.items[0].value, approvedMetric.records[0].followerCount);

function buildFixture(metricData, rosterData, avatars = new Map()) {
  const metricsByLogin = new Map(metricData.records.map((item) => [item.login, item]));
  return { items: rosterData.items.flatMap((item) => {
    if (item.status !== "ownerApproved") return [];
    const metric = metricsByLogin.get(item.login);
    return metric && metric.id === item.id ? [{ id: item.id, name: item.displayLabel, imageUrl: avatars.get(item.login) ?? createTwitchAvatarDataUri(item.login, item.displayLabel), value: metric.followerCount }] : [];
  }) };
}

console.log(`Twitch validation passed: Metrika/roster reconciliation, identicon determinism, approved fixture; avatarArtifact=${avatarStatus}.`);
