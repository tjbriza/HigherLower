/**
 * Number of Albums — local snapshot reader.
 *
 * The live MusicBrainz + Wikidata path (see `musicbrainz.ts` and
 * `wikidataArtistImages.ts`) is correct and produces production-quality data,
 * but it is inherently too slow for a request-time fetch: the MusicBrainz
 * one-request-per-second contract makes the browse phase alone ~86 s of
 * unavoidable pacing (measured end-to-end ~100 s for the 17-artist pool).
 *
 * This module lets normal gameplay read a pre-generated, normalized snapshot
 * instead of performing that crawl at request time. The snapshot is produced by
 * the developer-run generator (`scripts/generate-artist-album-counts-snapshot.mjs`),
 * which reuses the existing live adapter logic. The live adapter is preserved
 * unchanged so the snapshot can be regenerated at any time.
 *
 * Design constraints (see the provider plan, Sections 3, 21, and 22):
 *   - Store ONLY public, gameplay-safe fields needed by the `GameItem`
 *     contract. No credentials, diagnostics, or private environment values.
 *   - Deterministic and reviewable: the snapshot is a plain JSON file with a
 *     stable shape and a stable item order.
 *   - Fail closed: a malformed snapshot, or one with fewer than the minimum
 *     playable items, throws `ApiFetchError` so the route renders the
 *     `error`/`empty` state rather than a thin or broken pool.
 *
 * This module is server-only. It is imported only by the dispatcher
 * (`lib/api/index.ts`), which is reached only from the server page
 * `app/game/[mode]/page.tsx`. It must never be imported by a client component.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GameItem, ApiFetchError } from "@/types/api";

// ─── Snapshot contract ────────────────────────────────────────────────────────

/**
 * The snapshot file format. `items` is the normalized `GameItem[]` pool; the
 * remaining fields are review metadata (no credentials, no diagnostics).
 */
export interface ArtistAlbumCountsSnapshot {
  /** Snapshot format version; bumped only on an incompatible shape change. */
  readonly version: number;
  /** ISO-8601 UTC timestamp of when the snapshot was generated. */
  readonly generatedAt: string;
  /** Human-readable description of the authoritative data source. */
  readonly source: string;
  /** Normalized, gameplay-safe items. */
  readonly items: readonly GameItem[];
}

/** Current snapshot format version. */
export const ARTIST_ALBUM_COUNTS_SNAPSHOT_VERSION = 1;

/**
 * Minimum number of playable items a snapshot must contain. Mirrors the
 * dispatcher's own ≥ 2 hard floor; a snapshot below this is treated as
 * malformed and fails closed.
 */
export const MIN_SNAPSHOT_ITEMS = 2;
const MBID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Location of the generated snapshot, relative to the project root. Kept
 * inside `lib/api/data/` so it ships with the server bundle and is not
 * client-served.
 */
const SNAPSHOT_RELATIVE_PATH = "lib/api/data/artist-album-counts.snapshot.json";

// ─── Validation ───────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a single normalized item. Only the public `GameItem` fields are
 * accepted; anything else is rejected so the snapshot cannot smuggle in
 * non-gameplay data. `attribution` is an optional public credit line.
 */
function isValidItem(value: unknown): value is GameItem {
  if (!isRecord(value)) return false;
  const {
    id,
    name,
    imageUrl,
    value: itemValue,
    displayValue,
    attribution,
  } = value;
  const idOk = typeof id === "string" || typeof id === "number";
  const attributionOk =
    attribution === undefined || typeof attribution === "string";
  return (
    idOk &&
    typeof name === "string" &&
    name.length > 0 &&
    typeof imageUrl === "string" &&
    imageUrl.length > 0 &&
    typeof itemValue === "number" &&
    Number.isFinite(itemValue) &&
    typeof displayValue === "string" &&
    displayValue.length > 0 &&
    attributionOk
  );
}

/**
 * Parse and validate raw snapshot JSON. Throws `ApiFetchError` (fail closed)
 * when the shape is malformed or the pool is below the minimum playable size.
 */
export function parseArtistAlbumCountsSnapshot(
  raw: unknown,
): ArtistAlbumCountsSnapshot {
  if (!isRecord(raw)) {
    throw new ApiFetchError(
      "ArtistAlbumCountsSnapshot",
      null,
      "Snapshot is not a JSON object.",
    );
  }

  if (raw.version !== ARTIST_ALBUM_COUNTS_SNAPSHOT_VERSION) {
    throw new ApiFetchError(
      "ArtistAlbumCountsSnapshot",
      null,
      `Unsupported snapshot version: ${String(raw.version)}.`,
    );
  }

  if (typeof raw.generatedAt !== "string" || raw.generatedAt.length === 0) {
    throw new ApiFetchError(
      "ArtistAlbumCountsSnapshot",
      null,
      "Snapshot is missing a valid generatedAt timestamp.",
    );
  }

  if (typeof raw.source !== "string" || raw.source.length === 0) {
    throw new ApiFetchError(
      "ArtistAlbumCountsSnapshot",
      null,
      "Snapshot is missing a valid source description.",
    );
  }

  if (!Array.isArray(raw.items)) {
    throw new ApiFetchError(
      "ArtistAlbumCountsSnapshot",
      null,
      "Snapshot items is not an array.",
    );
  }

  const items: GameItem[] = [];
  const ids = new Set<string>();
  let previousId = "";
  for (const candidate of raw.items) {
    if (!isValidItem(candidate)) {
      throw new ApiFetchError(
        "ArtistAlbumCountsSnapshot",
        null,
        "Snapshot contains a malformed item.",
      );
    }
    if (typeof candidate.id !== "string" || !MBID_PATTERN.test(candidate.id)) {
      throw new ApiFetchError(
        "ArtistAlbumCountsSnapshot",
        null,
        "Snapshot contains a non-exact MusicBrainz artist MBID.",
      );
    }
    if (ids.has(candidate.id)) {
      throw new ApiFetchError(
        "ArtistAlbumCountsSnapshot",
        null,
        "Snapshot contains duplicate MusicBrainz artist MBIDs.",
      );
    }
    if (previousId && candidate.id < previousId) {
      throw new ApiFetchError(
        "ArtistAlbumCountsSnapshot",
        null,
        "Snapshot items are not deterministically sorted by MBID.",
      );
    }
    ids.add(candidate.id);
    previousId = candidate.id;
    items.push({
      id: candidate.id,
      name: candidate.name,
      imageUrl: candidate.imageUrl,
      value: candidate.value,
      displayValue: candidate.displayValue,
      ...(candidate.attribution !== undefined
        ? { attribution: candidate.attribution }
        : {}),
    });
  }

  if (items.length < MIN_SNAPSHOT_ITEMS) {
    throw new ApiFetchError(
      "ArtistAlbumCountsSnapshot",
      null,
      `Snapshot contains fewer than ${MIN_SNAPSHOT_ITEMS} playable items.`,
    );
  }

  return {
    version: raw.version,
    generatedAt: raw.generatedAt,
    source: raw.source,
    items,
  };
}

// ─── Reader ───────────────────────────────────────────────────────────────────

/**
 * Read and validate the generated snapshot from disk. Throws `ApiFetchError`
 * (fail closed) when the file is missing, unreadable, malformed, or below the
 * minimum playable size.
 *
 * The read is synchronous and performed once per call. The dispatcher's
 * shuffle runs on the returned array, so the snapshot's own order is stable
 * and reviewable while gameplay order stays random.
 */
export function readArtistAlbumCountsSnapshot(): ArtistAlbumCountsSnapshot {
  const path = join(process.cwd(), SNAPSHOT_RELATIVE_PATH);

  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    throw new ApiFetchError(
      "ArtistAlbumCountsSnapshot",
      null,
      `Snapshot file not found at ${SNAPSHOT_RELATIVE_PATH}. ` +
        "Run `npm run snapshot:artist-album-counts` to generate it.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiFetchError(
      "ArtistAlbumCountsSnapshot",
      null,
      "Snapshot file is not valid JSON.",
    );
  }

  return parseArtistAlbumCountsSnapshot(parsed);
}

/**
 * Return the snapshot's normalized items. This is the gameplay-facing entry
 * point used by the dispatcher. Async to match the dispatcher's `FetcherFn`
 * contract; the underlying read is synchronous and local.
 */
export async function fetchArtistAlbumCountsFromSnapshot(): Promise<GameItem[]> {
  return [...readArtistAlbumCountsSnapshot().items];
}
