/**
 * Developer-run snapshot generator — `album-release-date`.
 *
 * Produces `lib/api/data/album-release-date.snapshot.json`, the normalized
 * local snapshot that normal gameplay reads instead of performing the
 * request-time MusicBrainz crawl.
 *
 * How it works
 * ------------
 * This script performs bounded MusicBrainz artist discovery (the same
 * eight-tag `type:group AND tag:<genre>` configuration used by the Number of
 * Albums generator), includes the curated artists as seeds, and posts the
 * exact artist MBIDs to the dev-only route:
 *
 *     POST <base>/api/test-fetch
 *     { category: "album-release-dates", artists: [...], targetItems: N }
 *
 * The route runs the existing bounded target-fill album adapter
 * (`generateAlbumReleaseDates()` in `lib/api/musicbrainz.ts`) through the real
 * dispatcher, then returns the full, unshuffled, sanitized `GameItem[]` pool
 * plus generation diagnostics. This script validates that pool and writes it
 * to the snapshot file atomically.
 *
 * Bounded target-fill
 * -------------------
 * The adapter deterministically orders artists (stable MBID sort), samples at
 * most `MAX_RELEASE_GROUPS_PER_ARTIST` release groups per artist, and stops
 * once `targetItems` unique albums are accumulated. This is a bounded
 * generation budget, not an exhaustive crawl: the measured Phase 4 diagnostic
 * showed ~10 usable albums per artist, so ~200 items is reached in roughly
 * 20–25 artists (a few minutes of paced requests) rather than crawling all
 * ~300 discovered artists.
 *
 * Usage
 * -----
 *   1. Start the dev server:  npm run dev
 *   2. In another terminal:   npm run snapshot:album-release-date
 *
 * MusicBrainz discovery and browse requests are paced at >=1.1 seconds. This is
 * a developer-run step, never a gameplay/runtime cost.
 *
 * Determinism / safety
 * --------------------
 *   - Only public, gameplay-safe `GameItem` fields are written
 *     (`id`, `name`, `imageUrl`, `value`, `displayValue`).
 *   - No credentials, tokens, diagnostics, or private environment values are
 *     read or written. The script never inspects `.env*`.
 *   - Items are sorted by a stable key before writing so the file is
 *     reviewable and diff-friendly.
 *   - The script fails closed (non-zero exit) if the pool is malformed, has
 *     duplicate release-group IDs, or is below the minimum playable size. The
 *     write is atomic (temp file + rename); a failure leaves the previous
 *     snapshot intact.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

const SNAPSHOT_VERSION = 1;
const MIN_ITEMS = 2;
const CATEGORY = "album-release-dates";
const MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2";
const MUSICBRAINZ_USER_AGENT = "HigherLower/0.1 (https://github.com/higherlower)";
const REQUEST_SPACING_MS = 1150;
const RESULT_LIMIT = 50;
/**
 * Bounded generation target. This is a generation budget, not a product cap
 * and not the ~50 readiness floor. It bounds the run so the generator stops
 * once a comfortably deep, diverse pool is accumulated instead of crawling
 * every discovered artist. Overridable via SNAPSHOT_TARGET_ITEMS.
 */
const TARGET_ITEMS = Number(process.env.SNAPSHOT_TARGET_ITEMS ?? 220);
// The dev route runs the full sequential MusicBrainz + Cover Art Archive
// adapter and can take several minutes. Node's global `fetch` (undici) enforces
// a default 300 s headers/body timeout that fires independently of any
// `AbortSignal`, aborting the client before the payload arrives. The generation
// POST therefore uses a plain `node:http` request with an explicit, finite
// timeout comfortably above the observed route duration. This bounds only the
// client wait; it does not change the route, adapter, pacing, or any gate.
const GENERATION_REQUEST_TIMEOUT_MS = 15 * 60 * 1000;
const DISCOVERY_TAGS = [
  "rock",
  "pop",
  "jazz",
  "electronic",
  "metal",
  "hip hop",
  "country",
  "classical",
];
const MBID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SNAPSHOT_PATH = join(
  PROJECT_ROOT,
  "lib",
  "api",
  "data",
  "album-release-date.snapshot.json",
);

const BASE_URL = process.env.SNAPSHOT_BASE_URL ?? "http://localhost:3000";
let lastMusicBrainzRequestAt = 0;
let musicBrainzRequestCount = 0;
let musicBrainzRetryCount = 0;
let minObservedSpacingMs = Infinity;
let maxObservedSpacingMs = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST a JSON body and resolve with the parsed response. Uses `node:http`
 * rather than global `fetch` so the client wait is bounded only by the explicit
 * `timeoutMs`; undici's default 300 s headers/body timeout would otherwise
 * abort the legitimate multi-minute dev-route generation before the payload
 * arrives. Rejects on transport error, timeout, or non-2xx status.
 */
function postJson(url, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const data = JSON.stringify(payload);
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, body });
          } else {
            reject(
              new Error(
                `Dev route returned HTTP ${res.statusCode}. Body: ${body.slice(0, 500)}`,
              ),
            );
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Generation request timed out after ${timeoutMs} ms.`));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function musicBrainzGet(url) {
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const elapsed = Date.now() - lastMusicBrainzRequestAt;
    const delay = Math.max(0, REQUEST_SPACING_MS - elapsed);
    if (lastMusicBrainzRequestAt) await sleep(delay);
    const requestAt = Date.now();
    if (lastMusicBrainzRequestAt) {
      const spacing = requestAt - lastMusicBrainzRequestAt;
      minObservedSpacingMs = Math.min(minObservedSpacingMs, spacing);
      maxObservedSpacingMs = Math.max(maxObservedSpacingMs, spacing);
    }
    lastMusicBrainzRequestAt = requestAt;
    musicBrainzRequestCount += 1;
    const response = await fetch(url, {
      headers: { "User-Agent": MUSICBRAINZ_USER_AGENT, Accept: "application/json" },
    });
    if (response.ok) return response.json();
    if (response.status !== 503 || attempt === 3) {
      throw new Error(`MusicBrainz request returned HTTP ${response.status}.`);
    }
    musicBrainzRetryCount += 1;
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.max(5000, retryAfter * 1000)
      : [5000, 15000, 45000][attempt];
    console.warn(`[snapshot] MusicBrainz returned HTTP 503; backing off ${backoffMs} ms before retry ${attempt + 1}/3.`);
    await sleep(backoffMs);
  }
  throw new Error("MusicBrainz request retry budget was exhausted.");
}

function readSeedArtists() {
  const source = readFileSync(join(PROJECT_ROOT, "lib", "api", "curatedPools.ts"), "utf8");
  const block = source.match(/export const CURATED_ARTISTS:[\s\S]*?= \[([\s\S]*?)\n\];/);
  if (!block) throw new Error("Could not read MusicBrainz seed artists.");
  const artists = [...block[1].matchAll(/\{\s*mbid:\s*["']([^"']+)["'],\s*name:\s*["']([^"']+)["']\s*\}/g)]
    .map((match) => ({ mbid: match[1], name: match[2] }));
  if (!artists.length || artists.some((artist) => !MBID_PATTERN.test(artist.mbid))) {
    throw new Error("MusicBrainz seeds contain an invalid MBID.");
  }
  return artists;
}

async function discoverArtists() {
  const byMbid = new Map();
  let rawCandidateCount = 0;
  let invalidMbidCount = 0;
  let duplicateCount = 0;
  let pages = 0;
  for (const tag of DISCOVERY_TAGS) {
    const url = new URL(`${MUSICBRAINZ_BASE}/artist`);
    url.searchParams.set("query", `type:group AND tag:"${tag}"`);
    url.searchParams.set("fmt", "json");
    url.searchParams.set("limit", String(RESULT_LIMIT));
    const data = await musicBrainzGet(url);
    pages += 1;
    const artists = Array.isArray(data.artists) ? data.artists : [];
    for (const artist of artists) {
      rawCandidateCount += 1;
      const mbid = artist?.id;
      const name = typeof artist?.name === "string" ? artist.name.trim() : "";
      if (typeof mbid !== "string" || !MBID_PATTERN.test(mbid) || !name) {
        invalidMbidCount += 1;
        continue;
      }
      if (byMbid.has(mbid)) {
        duplicateCount += 1;
        continue;
      }
      byMbid.set(mbid, { mbid, name });
    }
  }
  const seeds = readSeedArtists();
  let seedDuplicates = 0;
  for (const seed of seeds) {
    if (byMbid.has(seed.mbid)) {
      duplicateCount += 1;
      seedDuplicates += 1;
    } else {
      byMbid.set(seed.mbid, seed);
    }
  }
  const discovered = [...byMbid.values()].sort((a, b) =>
    a.mbid === b.mbid ? 0 : a.mbid < b.mbid ? -1 : 1,
  );
  return {
    artists: discovered,
    metrics: {
      queries: DISCOVERY_TAGS.length,
      pages,
      rawCandidateCount,
      uniqueDiscoveredMbids: discovered.length - (seeds.length - seedDuplicates),
      duplicates: duplicateCount,
      invalidMbidCount,
      seeds: seeds.length,
      seedDuplicates,
      candidatesIncludingSeeds: discovered.length,
    },
  };
}

function fail(message) {
  console.error(`\n[snapshot] ERROR: ${message}\n`);
  process.exit(1);
}

/**
 * Validate the required generation diagnostics returned by the dev route
 * BEFORE any snapshot write/rename. A missing or malformed diagnostic field
 * must fail closed rather than failing after the atomic write has already been
 * attempted.
 *
 * Returns the validated, normalized diagnostics, or throws a plain Error whose
 * message names only the offending field (never a value, artist, MBID, URL, or
 * response body).
 */
function validateGenerationDiagnostics(payload) {
  const isFiniteCount = (value) =>
    typeof value === "number" && Number.isInteger(value) && value >= 0;

  const requiredCounts = [
    "candidates",
    "artistsCrawled",
    "releaseGroupsInspected",
    "recordsWithDates",
    "missingDate",
    "caaRequests",
    "caaSuccess",
    "caaMissing",
    "caaFailures",
    "emitted",
    "artistsRepresented",
    "maxAlbumsPerArtist",
  ];
  for (const field of requiredCounts) {
    if (!isFiniteCount(payload[field])) {
      throw new Error(
        `Dev route response is missing a valid \`${field}\` diagnostic count.`,
      );
    }
  }

  return {
    candidates: payload.candidates,
    artistsCrawled: payload.artistsCrawled,
    releaseGroupsInspected: payload.releaseGroupsInspected,
    recordsWithDates: payload.recordsWithDates,
    missingDate: payload.missingDate,
    caaRequests: payload.caaRequests,
    caaSuccess: payload.caaSuccess,
    caaMissing: payload.caaMissing,
    caaFailures: payload.caaFailures,
    emitted: payload.emitted,
    artistsRepresented: payload.artistsRepresented,
    maxAlbumsPerArtist: payload.maxAlbumsPerArtist,
  };
}

function isValidItem(item) {
  if (typeof item !== "object" || item === null) return false;
  const idOk = typeof item.id === "string" || typeof item.id === "number";
  const attributionOk =
    item.attribution === undefined || typeof item.attribution === "string";
  return (
    idOk &&
    typeof item.name === "string" &&
    item.name.length > 0 &&
    typeof item.imageUrl === "string" &&
    item.imageUrl.length > 0 &&
    typeof item.value === "number" &&
    Number.isFinite(item.value) &&
    typeof item.displayValue === "string" &&
    item.displayValue.length > 0 &&
    attributionOk
  );
}

async function main() {
  const startedAt = Date.now();
  const discovery = await discoverArtists();
  console.log(
    `[snapshot] Discovery: ${discovery.metrics.queries} queries/pages, ${discovery.metrics.rawCandidateCount} raw observations, ${discovery.metrics.uniqueDiscoveredMbids} unique discovered MBIDs, ${discovery.metrics.duplicates} duplicate observations, ${discovery.metrics.invalidMbidCount} invalid records, ${discovery.metrics.seeds} seeds (${discovery.metrics.seedDuplicates} overlaps), ${discovery.artists.length} total candidates.`,
  );
  console.log(
    `[snapshot] Posting ${discovery.artists.length} exact artist MBIDs to the dev-only generator route (targetItems=${TARGET_ITEMS}).`,
  );

  const url = `${BASE_URL}/api/test-fetch`;
  let response;
  try {
    response = await postJson(
      url,
      { category: CATEGORY, artists: discovery.artists, targetItems: TARGET_ITEMS },
      GENERATION_REQUEST_TIMEOUT_MS,
    );
  } catch (err) {
    fail(
      `Could not reach the dev server at ${BASE_URL}. ` +
        `Start it with \`npm run dev\` first. (${err.message})`,
    );
  }

  let payload;
  try {
    payload = JSON.parse(response.body);
  } catch {
    fail("Dev route did not return valid JSON.");
  }

  if (!Array.isArray(payload.items) || !Number.isInteger(payload.candidates)) {
    fail("Dev route response is missing valid generation metrics or an `items` array.");
  }

  // Validate every required diagnostic field BEFORE any snapshot write/rename.
  let diagnostics;
  try {
    diagnostics = validateGenerationDiagnostics(payload);
  } catch (err) {
    fail(err.message);
  }

  const items = payload.items;
  for (const item of items) {
    if (!isValidItem(item)) {
      fail("Dev route returned a malformed item; refusing to write snapshot.");
    }
  }

  if (items.length < MIN_ITEMS) {
    fail(
      `Pool has ${items.length} items, below the minimum of ${MIN_ITEMS}. ` +
        "Refusing to write a non-playable snapshot.",
    );
  }
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    fail("Dev route returned duplicate release-group MBIDs; refusing to write snapshot.");
  }

  // Deterministic, reviewable order: stable sort by id, then name.
  const sorted = [...items].sort((a, b) => {
    const idA = String(a.id);
    const idB = String(b.id);
    if (idA !== idB) return idA < idB ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  // Project to ONLY the public, gameplay-safe GameItem fields.
  const projected = sorted.map((item) => ({
    id: item.id,
    name: item.name,
    imageUrl: item.imageUrl,
    value: item.value,
    displayValue: item.displayValue,
    ...(item.attribution !== undefined
      ? { attribution: item.attribution }
      : {}),
  }));

  const snapshot = {
    version: SNAPSHOT_VERSION,
    generatedAt: new Date().toISOString(),
    source:
      "MusicBrainz release-group browse + Cover Art Archive front image " +
      "(bounded MusicBrainz artist discovery plus curated seeds). Generated by " +
      "scripts/generate-album-release-date-snapshot.mjs.",
    items: projected,
  };

  const uniqueDates = new Set(projected.map((i) => i.displayValue)).size;
  const valueCounts = new Map();
  for (const item of projected) valueCounts.set(item.value, (valueCounts.get(item.value) ?? 0) + 1);
  const tieGroups = [...valueCounts.values()].filter((count) => count > 1).length;
  const tiedItems = [...valueCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  const durationMs = Date.now() - startedAt;

  // Atomic write: temp file + rename. A failure leaves the previous snapshot
  // intact.
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  const tempPath = `${SNAPSHOT_PATH}.${process.pid}.tmp`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
    renameSync(tempPath, SNAPSHOT_PATH);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Preserve the original write/rename error.
    }
    throw error;
  }

  console.log(`[snapshot] Wrote ${projected.length} items to ${SNAPSHOT_PATH}`);
  console.log(
    `[snapshot] candidates=${diagnostics.candidates}; artists_crawled=${diagnostics.artistsCrawled}; final=${projected.length}; release_groups_inspected=${diagnostics.releaseGroupsInspected}; records_with_dates=${diagnostics.recordsWithDates}; missing_date=${diagnostics.missingDate}.`,
  );
  console.log(
    `[snapshot] caa_requests=${diagnostics.caaRequests}; caa_success=${diagnostics.caaSuccess}; caa_missing=${diagnostics.caaMissing}; caa_failures=${diagnostics.caaFailures}.`,
  );
  console.log(
    `[snapshot] unique_dates=${uniqueDates}; tie_groups=${tieGroups}; tied_items=${tiedItems}; artists_represented=${diagnostics.artistsRepresented}; max_albums_per_artist=${diagnostics.maxAlbumsPerArtist}.`,
  );
  console.log(
    `[snapshot] duration_ms=${durationMs}; MusicBrainz_requests=${musicBrainzRequestCount}; retries=${musicBrainzRetryCount}; observed_spacing_ms=${Number.isFinite(minObservedSpacingMs) ? `${minObservedSpacingMs}-${maxObservedSpacingMs}` : "single request"}; minimum_required_ms=${REQUEST_SPACING_MS}.`,
  );
}

main().catch((err) => fail(err?.stack ?? String(err)));
