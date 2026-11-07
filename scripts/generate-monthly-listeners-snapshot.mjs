import { createMetrikaClient } from "./monthly-listeners-provider.mjs";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = process.cwd();
const identityPath = join(projectRoot, "lib/api/data/music-spotify-identities.json");
const destination = join(projectRoot, "lib/api/data/monthly-listeners.snapshot.json");
const tempPath = `${destination}.${process.pid}.tmp`;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_ITEMS = 2;
const EXPECTED_APPROVED_ITEMS = 236;

function validateIdentityCatalog(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.records)) throw new Error("Identity catalog schema invalid.");
  const approved = raw.records.filter((record) => record?.approved === true &&
    typeof record.mbid === "string" && typeof record.name === "string" &&
    typeof record.spotifyArtistId === "string" && /^[A-Za-z0-9]{22}$/.test(record.spotifyArtistId));
  if (approved.length !== raw.records.filter((record) => record?.approved === true).length) throw new Error("Approved identity record malformed.");
  if (new Set(approved.map((record) => record.spotifyArtistId)).size !== approved.length) throw new Error("Duplicate Spotify identity in approved catalog.");
  if (new Set(approved.map((record) => record.mbid)).size !== approved.length) throw new Error("Duplicate MusicBrainz identity in approved catalog.");
  if (approved.some((record) => !record.imageUrl || !record.imageUrl.startsWith("https://"))) throw new Error("Approved identity lacks a validated HTTPS image.");
  if (approved.length !== EXPECTED_APPROVED_ITEMS) throw new Error("Approved identity count differs from the authorized Pass 3 catalog.");
  return approved;
}

function validateSnapshot(raw, now = Date.now()) {
  if (!raw || raw.version !== 1 || raw.category !== "monthly-listeners" ||
    typeof raw.generatedAt !== "string" || typeof raw.collectedAt !== "string" || !Array.isArray(raw.items)) {
    throw new Error("Monthly listeners snapshot schema invalid.");
  }
  const generatedAt = Date.parse(raw.generatedAt);
  if (!Number.isFinite(generatedAt) || generatedAt > now || now - generatedAt > MAX_AGE_MS) throw new Error("Monthly listeners snapshot is hard-stale or has invalid generation time.");
  const ids = new Set();
  for (const item of raw.items) {
    if (!item || typeof item.id !== "string" || !/^[0-9a-f-]{36}$/i.test(item.id) || ids.has(item.id) ||
      typeof item.name !== "string" || !item.name.trim() || typeof item.imageUrl !== "string" ||
      !/^https:\/\//.test(item.imageUrl) || !Number.isSafeInteger(item.value) || item.value < 0 ||
      item.displayValue !== `${item.value.toLocaleString("en-US")} monthly listeners` ||
      Object.keys(item).some((key) => !["id", "name", "imageUrl", "value", "displayValue", "attribution"].includes(key))) {
      throw new Error("Monthly listeners snapshot item invalid.");
    }
    ids.add(item.id);
  }
  if (raw.items.length < MIN_ITEMS) throw new Error("Monthly listeners snapshot below minimum pool size.");
  return raw;
}

async function publishAtomically(snapshot) {
  await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  try {
    validateSnapshot(JSON.parse(await readFile(tempPath, "utf8")));
    await rename(tempPath, destination);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

const identityData = JSON.parse(await readFile(identityPath, "utf8"));
const identities = validateIdentityCatalog(identityData);
const client = createMetrikaClient({ token: process.env.METRIKA_API_TOKEN,
  beforeRequest: async (requestNumber) => {
    if (requestNumber === 1 && process.env.METRIKA_AUTHORIZED !== "yes") throw new Error("Set METRIKA_AUTHORIZED=yes only after owner-approved access and terms confirmation.");
  } });
const providerResults = await client.searchSpotifyArtists(identities.map((identity) => identity.spotifyArtistId));
if (providerResults.length !== identities.length) throw new Error("Metrika results incomplete; prior snapshot preserved.");
const stateCounts = Object.fromEntries(["available", "pending", "not_found", "stale", "unavailable"].map((status) =>
  [status, providerResults.filter((result) => result.status === status).length]));
const nonAvailableCount = providerResults.length - stateCounts.available;
if (nonAvailableCount > 0) {
  console.log(JSON.stringify({ stopped: true, reason: "pending-later-collection", pendingCount: stateCounts.pending,
    nonPublishableCount: nonAvailableCount, stateCounts, requestCount: client.requestCount }));
  process.exitCode = 3;
} else {
const bySpotifyId = new Map(providerResults.map((record) => [record.identifier, record]));
const items = [];
const collectedTimes = [];
for (const identity of identities) {
  const result = bySpotifyId.get(identity.spotifyArtistId);
  if (!result || result.status !== "available" || result.monthlyListeners === null || !result.collectedAt) {
    throw new Error("Metrika returned a non-publishable state; prior snapshot preserved.");
  }
  // Reuse the existing exact-MBID Wikidata/Commons image already validated into the identity catalog.
  const imageUrl = identity.imageUrl;
  if (typeof imageUrl !== "string" || !/^https:\/\//.test(imageUrl)) throw new Error("Approved image missing for an identity; prior snapshot preserved.");
  items.push({ id: identity.mbid, name: identity.name, imageUrl, value: result.monthlyListeners,
    displayValue: `${result.monthlyListeners.toLocaleString("en-US")} monthly listeners`,
    ...(typeof identity.attribution === "string" ? { attribution: identity.attribution } : {}) });
  collectedTimes.push(result.collectedAt);
}
items.sort((a, b) => a.id.localeCompare(b.id));
  const collectedAt = new Date(Math.min(...collectedTimes.map(Date.parse))).toISOString();
const snapshot = validateSnapshot({ version: 1, category: "monthly-listeners", generatedAt: new Date().toISOString(), collectedAt,
  source: "Metrika Spotify artist views (semantic: monthly listeners)", items });
await publishAtomically(snapshot);
console.log(JSON.stringify({ requestCount: client.requestCount, publishedItems: items.length, generatedAt: snapshot.generatedAt,
  stateCounts, imageCount: items.filter((item) => /^https:\/\//.test(item.imageUrl)).length,
  collectionAgeHours: (Date.now() - Date.parse(snapshot.collectedAt)) / 3_600_000,
  duplicateIds: items.length - new Set(items.map((item) => item.id)).size }));
}
