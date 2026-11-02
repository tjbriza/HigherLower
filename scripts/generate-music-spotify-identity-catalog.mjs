import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const snapshotPath = join(root, "lib/api/data/artist-album-counts.snapshot.json");
const outputPath = join(root, "lib/api/data/music-spotify-identities.json");
const tempPath = `${outputPath}.${process.pid}.tmp`;
const mbBase = "https://musicbrainz.org/ws/2/artist/";
const wdEndpoint = "https://www.wikidata.org/w/api.php";
const mbidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const spotifyPattern = /^[A-Za-z0-9]{22}$/;
const clocks = { mb: 0, wd: 0 };
const USER_AGENT = process.env.IDENTITY_CENSUS_CONTACT
  ? `HigherLower/0.1 (${process.env.IDENTITY_CENSUS_CONTACT})`
  : "HigherLower/0.1 (https://github.com/higherlower; contact: project-maintainer)";
const MAX_RETRIES = 3;

function retryDelay(response, attempt) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return Math.max(5000, 5000 * (2 ** (attempt - 1)));
}

async function getJson(url, source) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const previous = clocks[source];
    if (previous) await new Promise((resolve) => setTimeout(resolve, Math.max(0, (source === "mb" ? 1100 : 5000) - (Date.now() - previous))));
    clocks[source] = Date.now();
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: source === "mb" ? "application/json" : "application/sparql-results+json" } });
    if (response.ok) return response.json();
    if (!["wd", "mb"].includes(source) || ![429, 503].includes(response.status) || attempt === MAX_RETRIES) {
      throw new Error(`${source} identity source returned HTTP ${response.status}${attempt === MAX_RETRIES ? ` after ${attempt} attempts` : ""}.`);
    }
    const wait = retryDelay(response, attempt);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  throw new Error(`${source} identity source exhausted its bounded retry policy.`);
}

function spotifyId(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    return ["open.spotify.com", "www.open.spotify.com"].includes(parsed.hostname) && parts.length === 2 && parts[0] === "artist" && spotifyPattern.test(parts[1]) ? parts[1] : null;
  } catch { return null; }
}

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
if (!Array.isArray(snapshot.items)) throw new Error("Artist snapshot malformed.");
const censusInput = process.env.MUSIC_IDENTITY_CENSUS_FILE;
const censusSource = censusInput ? JSON.parse(await readFile(censusInput, "utf8")) : snapshot;
if (!Array.isArray(censusSource.items)) throw new Error("Census source malformed.");
const source = censusSource.items;
const artists = new Map();
let invalidMbidCount = 0;
let duplicateMbidCount = 0;
for (const item of source) {
  if (typeof item?.id !== "string" || !mbidPattern.test(item.id) || typeof item.name !== "string" || !item.name.trim()) { invalidMbidCount += 1; continue; }
  const mbid = item.id.toLowerCase();
  if (artists.has(mbid)) { duplicateMbidCount += 1; continue; }
  artists.set(mbid, { mbid, name: item.name, imageUrl: item.imageUrl, attribution: item.attribution ?? null });
}
const records = [];
const statusCounts = {};
for (const artist of [...artists.values()].sort((a, b) => a.mbid.localeCompare(b.mbid))) {
  const mbUrl = new URL(`${mbBase}${encodeURIComponent(artist.mbid)}`);
  mbUrl.searchParams.set("fmt", "json"); mbUrl.searchParams.set("inc", "url-rels");
  const mbRaw = await getJson(mbUrl, "mb");
  const mbIds = (mbRaw.relations ?? []).map((relation) => typeof relation?.url?.resource === "string" ? spotifyId(relation.url.resource) : null).filter(Boolean);
  const wdSearchUrl = new URL(wdEndpoint);
  wdSearchUrl.searchParams.set("action", "wbsearchentities");
  wdSearchUrl.searchParams.set("search", artist.mbid);
  wdSearchUrl.searchParams.set("language", "en");
  wdSearchUrl.searchParams.set("format", "json");
  wdSearchUrl.searchParams.set("type", "item");
  const wdSearch = await getJson(wdSearchUrl, "wd");
  const exactQids = [...new Set((wdSearch.search ?? []).filter((entity) => entity?.match?.type === "entity-claim" && entity?.match?.text === artist.mbid && typeof entity.id === "string").map((entity) => entity.id))];
  const wdIds = [];
  for (const qid of exactQids) {
    const entityUrl = new URL(wdEndpoint);
    entityUrl.searchParams.set("action", "wbgetentities");
    entityUrl.searchParams.set("ids", qid);
    entityUrl.searchParams.set("props", "claims");
    entityUrl.searchParams.set("format", "json");
    const entityResponse = await getJson(entityUrl, "wd");
    const claims = entityResponse.entities?.[qid]?.claims;
    if (!(claims?.P434 ?? []).some((claim) => claim?.mainsnak?.datavalue?.value === artist.mbid)) continue;
    for (const claim of claims?.P1902 ?? []) {
      const value = claim?.mainsnak?.datavalue?.value;
      if (typeof value === "string") wdIds.push(value);
    }
  }
  const mb = [...new Set(mbIds.filter((id) => spotifyPattern.test(id)))];
  const wd = [...new Set(wdIds.filter((id) => spotifyPattern.test(id)))];
  let status = "missing"; let spotifyArtistId = null;
  if (mb.length > 1 || wd.length > 1) status = "ambiguous";
  else if (mb.length && wd.length) { status = mb[0] === wd[0] ? "both_agree" : "conflict"; if (status === "both_agree") spotifyArtistId = mb[0]; }
  else if (mb.length) { status = "musicbrainz_only"; spotifyArtistId = mb[0]; }
  else if (wd.length) { status = "wikidata_only"; spotifyArtistId = wd[0]; }
  const imageUrl = typeof artist.imageUrl === "string" && artist.imageUrl.startsWith("https://") ? artist.imageUrl : null;
  const approved = Boolean(spotifyArtistId && imageUrl);
  records.push({ mbid: artist.mbid, name: artist.name, spotifyArtistId, spotifyUrl: spotifyArtistId ? `https://open.spotify.com/artist/${spotifyArtistId}` : null, status, approved, imageUrl, attribution: artist.attribution });
  statusCounts[status] = (statusCounts[status] ?? 0) + 1;
}
const report = { sourceRecords: source.length, uniqueValidMbidCount: records.length, invalidMbidCount, duplicateMbidCount, approvedCount: records.filter((item) => item.approved).length, statusCounts };
const artifact = { version: 1, generatedAt: new Date().toISOString(), records };
await writeFile(tempPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
const readBack = JSON.parse(await readFile(tempPath, "utf8"));
if (readBack.records.length !== records.length || readBack.records.some((item) => item.spotifyArtistId === undefined)) { await unlink(tempPath).catch(() => {}); throw new Error("Identity catalog read-back failed."); }
await rename(tempPath, outputPath);
console.log(JSON.stringify(report, null, 2));
