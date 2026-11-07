/**
 * Developer-run snapshot generator — `number-of-albums`.
 *
 * Produces `lib/api/data/artist-album-counts.snapshot.json`, the normalized
 * local snapshot that normal gameplay reads instead of performing the
 * request-time MusicBrainz + Wikidata crawl.
 *
 * How it works
 * ------------
 * This script performs bounded MusicBrainz discovery, includes the curated
 * artists as seeds, and posts exact artist MBIDs to the dev-only route. The
 * route runs the existing MusicBrainz/Wikidata/Commons adapter; this script
 * does not reimplement album counting or image/license resolution.
 *
 *     POST <base>/api/test-fetch
 *
 * That route runs the real adapter through the real dispatcher (so the
 * `@/` path aliases and server-only code resolve exactly as in production),
 * then returns the full, unshuffled, sanitized `GameItem[]` pool. This script
 * validates that pool and writes it to the snapshot file.
 *
 * Usage
 * -----
 *   1. Start the dev server:  npm run dev
 *   2. In another terminal:   npm run snapshot:artist-album-counts
 *
 * MusicBrainz discovery and browse requests are paced at >=1.1 seconds. This
 * is a developer-run step, never a gameplay/runtime cost.
 *
 * Determinism / safety
 * --------------------
 *   - Only public, gameplay-safe `GameItem` fields are written
 *     (`id`, `name`, `imageUrl`, `value`, `displayValue`, and the optional
 *     public `attribution` credit line).
 *   - No credentials, tokens, diagnostics, or private environment values are
 *     read or written. The script never inspects `.env*`.
 *   - Items are sorted by a stable key before writing so the file is
 *     reviewable and diff-friendly.
 *   - The script fails closed (non-zero exit) if the pool is malformed or
 *     below the minimum playable size.
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
const MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2";
const MUSICBRAINZ_USER_AGENT = "HigherLower/0.1 (https://github.com/higherlower)";
const REQUEST_SPACING_MS = 1150;
const RESULT_LIMIT = 50;
// The dev route legitimately runs the full sequential MusicBrainz + Wikidata +
// Commons adapter and can take ~5.1 minutes. Node's global `fetch` (undici)
// enforces a default 300 s headers/body timeout that fires independently of any
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
  "artist-album-counts.snapshot.json",
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
 * must fail closed rather than silently bypassing the licensing guard or
 * failing after the atomic write has already been attempted.
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
    "countedArtists",
    "missingP18",
    "commonsMetadataFailures",
    "missingImages",
  ];
  for (const field of requiredCounts) {
    if (!isFiniteCount(payload[field])) {
      throw new Error(
        `Dev route response is missing a valid \`${field}\` diagnostic count.`,
      );
    }
  }

  const license = payload.licenseAttribution;
  if (typeof license !== "object" || license === null || Array.isArray(license)) {
    throw new Error(
      "Dev route response is missing a valid `licenseAttribution` diagnostic object.",
    );
  }
  const requiredLicenseCounts = [
    "attributionRequired",
    "attributionNotRequired",
    "unknownLicense",
    "requiredButNoCredit",
  ];
  for (const field of requiredLicenseCounts) {
    if (!isFiniteCount(license[field])) {
      throw new Error(
        `Dev route response is missing a valid \`licenseAttribution.${field}\` diagnostic count.`,
      );
    }
  }

  return {
    candidates: payload.candidates,
    countedArtists: payload.countedArtists,
    missingP18: payload.missingP18,
    commonsMetadataFailures: payload.commonsMetadataFailures,
    missingImages: payload.missingImages,
    licenseAttribution: {
      attributionRequired: license.attributionRequired,
      attributionNotRequired: license.attributionNotRequired,
      unknownLicense: license.unknownLicense,
      requiredButNoCredit: license.requiredButNoCredit,
    },
  };
}

/**
 * Format the safe aggregate counters used in fail-closed licensing errors.
 * Contains only counts — never artist names, MBIDs, image URLs, response
 * bodies, or credentials.
 */
function formatSafeAggregates(diagnostics) {
  const license = diagnostics.licenseAttribution;
  return (
    `candidates=${diagnostics.candidates}; counted=${diagnostics.countedArtists}; ` +
    `commons_metadata_failures=${diagnostics.commonsMetadataFailures}; ` +
    `missing_p18=${diagnostics.missingP18}; missing_images=${diagnostics.missingImages}; ` +
    `license_attribution_required=${license.attributionRequired}; ` +
    `license_attribution_not_required=${license.attributionNotRequired}; ` +
    `license_unknown=${license.unknownLicense}; ` +
    `license_required_without_credit=${license.requiredButNoCredit}`
  );
}

function isValidItem(item) {
  if (typeof item !== "object" || item === null) return false;
  const idOk = typeof item.id === "string" || typeof item.id === "number";
  const attributionOk =
    item.attribution === undefined || typeof item.attribution === "string";
  return (
    idOk &&
    typeof item.id === "string" &&
    MBID_PATTERN.test(item.id) &&
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
  const url = `${BASE_URL}/api/test-fetch`;
  console.log(`[snapshot] Posting ${discovery.artists.length} exact artist MBIDs to the dev-only generator route.`);

  let response;
  try {
    response = await postJson(
      url,
      { artists: discovery.artists },
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
  // A malformed response must fail closed here, not after the atomic write.
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
    fail("Dev route returned duplicate artist MBIDs; refusing to write snapshot.");
  }

  // Deterministic, reviewable order: stable sort by id, then name.
  const sorted = [...items].sort((a, b) => {
    const idA = String(a.id);
    const idB = String(b.id);
    if (idA !== idB) return idA < idB ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  // Project to ONLY the public, gameplay-safe GameItem fields. `attribution`
  // is an optional public credit line (present only when the image's license
  // requires it); it is not a credential or diagnostic.
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
      "MusicBrainz release-group browse (primary-type Album count) + " +
      "Wikidata P434 -> P18 artist image + Wikimedia Commons license metadata " +
      "(bounded MusicBrainz artist discovery plus curated seeds). Generated by " +
      "scripts/generate-artist-album-counts-snapshot.mjs.",
    items: projected,
  };

  const uniqueValues = new Set(projected.map((i) => i.value)).size;
  const valueCounts = new Map();
  for (const item of projected) valueCounts.set(item.value, (valueCounts.get(item.value) ?? 0) + 1);
  const tieGroups = [...valueCounts.values()].filter((count) => count > 1).length;
  const tiedItems = [...valueCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  const withAttribution = projected.filter((i) => i.attribution).length;
  const durationMs = Date.now() - startedAt;

  // Fail-closed licensing gate. Runs BEFORE any write/rename so a licensing
  // failure can never leave a partially written or replaced snapshot. The
  // error reports only safe aggregate counters.
  if (
    diagnostics.commonsMetadataFailures > Math.max(3, diagnostics.candidates * 0.05) ||
    diagnostics.licenseAttribution.unknownLicense > Math.max(3, diagnostics.candidates * 0.05) ||
    diagnostics.licenseAttribution.requiredButNoCredit > 0
  ) {
    fail(
      "At least one image has unknown licensing or required attribution without a credit line; prior snapshot retained. " +
        `Aggregates: ${formatSafeAggregates(diagnostics)}.`,
    );
  }

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
    `[snapshot] candidates=${diagnostics.candidates}; counted=${diagnostics.countedArtists}; final=${projected.length}; rejected_missing_p18=${diagnostics.missingP18}; rejected_commons_metadata=${diagnostics.commonsMetadataFailures}; rejected_no_resolved_image=${diagnostics.missingImages}.`,
  );
  console.log(
    `[snapshot] album_count_range=${Math.min(...projected.map((i) => i.value))}-${Math.max(...projected.map((i) => i.value))}; distinct_values=${uniqueValues}; tie_groups=${tieGroups}; tied_items=${tiedItems}.`,
  );
  console.log(
    `[snapshot] image_coverage=${projected.length}/${discovery.artists.length}; attribution_present=${withAttribution}; attribution_absent=${projected.length - withAttribution}; license/attribution unresolved=${diagnostics.commonsMetadataFailures}; duration_ms=${durationMs}; MusicBrainz_requests=${musicBrainzRequestCount}; retries=${musicBrainzRetryCount}; observed_spacing_ms=${Number.isFinite(minObservedSpacingMs) ? `${minObservedSpacingMs}-${maxObservedSpacingMs}` : "single request"}; minimum_required_ms=${REQUEST_SPACING_MS}.`,
  );
  console.log(
    `[snapshot] license_distribution attribution_required=${diagnostics.licenseAttribution.attributionRequired}; attribution_not_required=${diagnostics.licenseAttribution.attributionNotRequired}; unknown_license=${diagnostics.licenseAttribution.unknownLicense}; required_without_credit=${diagnostics.licenseAttribution.requiredButNoCredit}.`,
  );
}

main().catch((err) => fail(err?.stack ?? String(err)));
