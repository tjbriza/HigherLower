/**
 * Wikidata artist-image resolver — `number-of-albums` artist imagery.
 *
 * Purpose
 * -------
 * `number-of-albums` represents an ARTIST (one item per curated artist, with
 * `value` = count of `primary-type === "Album"` MusicBrainz release groups).
 * The metric therefore requires truthful ARTIST imagery. Using a random album's
 * Cover Art Archive artwork as the artist image is prohibited (see the provider
 * plan, Phase 2 image strategy, and Section 22).
 *
 * This module resolves genuine artist images from Wikidata:
 *
 *   curated artist MBID (curatedPools.ts)
 *     -> Wikidata SPARQL: ?artist wdt:P434 "<mbid>" ; wdt:P18 ?image
 *        (endpoint: https://query.wikidata.org/sparql?format=json)
 *     -> ?image = https://commons.wikimedia.org/wiki/Special:FilePath/<file>
 *     -> absolute, stable image URL for GameItem.imageUrl
 *
 * `P434` is literally "MusicBrainz artist ID", so the join is an exact
 * identifier match — no fuzzy artist-name matching is performed anywhere.
 *
 * Design constraints (see the provider plan, Sections 3 and 22):
 *   - ONE batched SPARQL request for the whole curated pool (`VALUES ?mbid`).
 *   - Deterministic multi-`P18` selection: prefer a preferred-ranked statement;
 *     otherwise choose a stable fallback by canonical Commons file name.
 *   - Retrieve enough Commons metadata to determine the file/source URL,
 *     author/creator, license, license URL, and whether attribution is required.
 *   - Do NOT assume every Commons image is CC0 or public domain. The license is
 *     read per file and surfaced truthfully via `GameItem.attribution` when the
 *     license requires attribution.
 *   - Server-only. No credentials are required. A descriptive `User-Agent` is
 *     sent per Wikimedia policy (a constant, not a secret).
 *
 * This module is imported only by the server-side MusicBrainz adapter
 * (`lib/api/musicbrainz.ts`), which is reached only through the dispatcher
 * (`lib/api/index.ts`) from the server page `app/game/[mode]/page.tsx`. It must
 * never be imported by a client component.
 */

import { ApiFetchError } from "@/types/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const WIKIDATA_SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const COMMONS_API_ENDPOINT = "https://commons.wikimedia.org/w/api.php";

/**
 * Descriptive User-Agent required by Wikimedia policy. A constant, not a
 * secret. Wikimedia asks that automated clients identify themselves.
 */
const USER_AGENT = "HigherLower/0.1 (https://github.com/higherlower)";

/** Artist images are stable; cache for a week (matches the MusicBrainz path). */
const REVALIDATE = 60 * 60 * 24 * 7;

/** Finite timeout for the batched SPARQL request. */
const SPARQL_TIMEOUT_MS = 30000;
const SPARQL_MBID_BATCH_SIZE = 50;
const SPARQL_BATCH_SPACING_MS = 1150;

/** Finite timeout for a single Commons metadata lookup. */
const COMMONS_TIMEOUT_MS = 8000;
const SPARQL_503_RETRIES = 2;

/**
 * Maximum simultaneous Commons metadata lookups. Commons is a separate host
 * with no one-request-per-second contract, so a small bounded concurrency is
 * safe. This is deliberately small and applies ONLY to Commons.
 */
const COMMONS_CONCURRENCY = 4;

/** Wikidata rank IRIs returned by the SPARQL `wikibase:rank` predicate. */
const PREFERRED_RANK = "http://wikiba.se/ontology#PreferredRank";

// ─── Raw response types ───────────────────────────────────────────────────────

interface SparqlBindingValue {
  readonly type: string;
  readonly value: string;
}

interface SparqlResponse {
  readonly results: {
    readonly bindings: ReadonlyArray<Record<string, SparqlBindingValue>>;
  };
}

interface CommonsExtMetadataField {
  readonly value?: string;
}

interface CommonsImageInfo {
  readonly url?: string;
  readonly descriptionurl?: string;
  readonly mime?: string;
  readonly width?: number;
  readonly height?: number;
  readonly extmetadata?: Record<string, CommonsExtMetadataField>;
}

interface CommonsQueryResponse {
  readonly query?: {
    readonly pages?: Record<
      string,
      { readonly missing?: unknown; readonly imageinfo?: CommonsImageInfo[] }
    >;
  };
}

// ─── Public result shape ──────────────────────────────────────────────────────

/**
 * A resolved artist image plus the licensing facts needed to decide whether
 * attribution must be surfaced. `attribution` is a ready-to-render credit line
 * when the license requires one, otherwise null.
 */
export interface ArtistImage {
  /** Absolute, stable image URL (Commons `Special:FilePath` -> upload host). */
  readonly imageUrl: string;
  /** Canonical Commons file name (without the `File:` prefix). */
  readonly fileName: string;
  /** Human-readable license short name (e.g. "CC BY-SA 4.0", "Public domain"). */
  readonly license: string | null;
  /** License URL where the provider supplies one. */
  readonly licenseUrl: string | null;
  /** Author/creator credit where available. */
  readonly author: string | null;
  /** Whether the license requires attribution. */
  readonly attributionRequired: boolean;
  /** Ready-to-render credit line when attribution is required; else null. */
  readonly attribution: string | null;
}

export interface ArtistImageResolution {
  readonly images: Map<string, ArtistImage>;
  readonly mbidsWithP18: number;
  readonly missingP18: number;
  readonly commonsMetadataFailures: number;
  readonly licenseAttribution: {
    readonly attributionRequired: number;
    readonly attributionNotRequired: number;
    readonly unknownLicense: number;
    readonly requiredButNoCredit: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strip HTML tags and collapse whitespace from a Commons metadata value. */
function stripHtml(value: string | undefined | null): string | null {
  if (!value) return null;
  const text = value
    .replace(/<[^>]*>/g, "")
    .replace(/&/g, "&")
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

/**
 * Extract the canonical Commons file name from a `P18` value. `P18` values are
 * `http(s)://commons.wikimedia.org/wiki/Special:FilePath/<file>` (the file name
 * is URL-encoded). Returns null when the value is not a Commons FilePath URL.
 */
export function commonsFileNameFromImageUrl(imageUrl: string): string | null {
  const marker = "Special:FilePath/";
  const index = imageUrl.indexOf(marker);
  if (index === -1) return null;
  const raw = imageUrl.slice(index + marker.length);
  // Drop any query/fragment and decode percent-encoding.
  const withoutQuery = raw.split(/[?#]/)[0];
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

/**
 * Build the absolute, stable image URL for a Commons file name. `Special:FilePath`
 * redirects to the stable `upload.wikimedia.org` URL and is the canonical
 * `P18`-style reference.
 */
function commonsFilePathUrl(fileName: string): string {
  return (
    "https://commons.wikimedia.org/wiki/Special:FilePath/" +
    encodeURIComponent(fileName.replace(/ /g, "_"))
  );
}

/**
 * Decide whether a license short name requires attribution. Public-domain and
 * CC0 files do not; CC BY / CC BY-SA (and similar) do. Unknown licenses are
 * treated as attribution-required so nothing is silently assumed permissive.
 */
function licenseRequiresAttribution(license: string | null): boolean {
  if (!license) return true;
  const normalized = license.toLowerCase();
  if (
    normalized.includes("public domain") ||
    normalized.includes("pd-") ||
    normalized === "pd" ||
    normalized.includes("cc0")
  ) {
    return false;
  }
  return true;
}

/**
 * Compose a compact, truthful credit line for an image that requires
 * attribution. Includes the author (when known), the license, and the license
 * URL (when supplied). Returns null when attribution is not required.
 */
function buildAttribution(
  author: string | null,
  license: string | null,
  licenseUrl: string | null,
  attributionRequired: boolean,
): string | null {
  if (!attributionRequired) return null;
  const parts: string[] = [];
  if (author) parts.push(author);
  if (license) parts.push(license);
  if (licenseUrl) parts.push(licenseUrl);
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

// ─── SPARQL: batched P434 -> P18 ──────────────────────────────────────────────

/**
 * Build the batched SPARQL query. One request resolves every curated MBID via
 * `VALUES ?mbid { ... }`. The `p:P18`/`ps:P18` statement path is used so the
 * statement rank is available for the deterministic multi-image rule.
 */
function buildSparqlQuery(mbids: readonly string[]): string {
  const values = mbids.map((mbid) => `"${mbid}"`).join(" ");
  return `
SELECT ?mbid ?artist ?image ?rank WHERE {
  VALUES ?mbid { ${values} }
  ?artist wdt:P434 ?mbid .
  OPTIONAL {
    ?artist p:P18 ?stmt .
    ?stmt ps:P18 ?image .
    OPTIONAL { ?stmt wikibase:rank ?rank . }
  }
}`.trim();
}

interface ArtistImageCandidate {
  readonly image: string;
  readonly rank: string | null;
}

/**
 * Fetch the batched `P434` -> `P18` mapping for the curated MBIDs. Returns a
 * map of MBID -> candidate images (possibly empty). Throws `ApiFetchError` on
 * non-OK HTTP so the caller fails closed.
 */
async function fetchArtistImageCandidates(
  mbids: readonly string[],
): Promise<Map<string, ArtistImageCandidate[]>> {
  const byMbid = new Map<string, ArtistImageCandidate[]>();
  for (let start = 0; start < mbids.length; start += SPARQL_MBID_BATCH_SIZE) {
    if (start > 0) await sleep(SPARQL_BATCH_SPACING_MS);
    const batch = mbids.slice(start, start + SPARQL_MBID_BATCH_SIZE);
    const url =
      `${WIKIDATA_SPARQL_ENDPOINT}?format=json&query=` +
      encodeURIComponent(buildSparqlQuery(batch));
    let response: Response | undefined;
    for (let attempt = 0; attempt <= SPARQL_503_RETRIES; attempt += 1) {
      try {
        response = await fetch(url, {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/sparql-results+json",
          },
          signal: AbortSignal.timeout(SPARQL_TIMEOUT_MS),
          next: { revalidate: REVALIDATE },
        });
      } catch (err) {
        throw new ApiFetchError(
          "Wikidata",
          null,
          `SPARQL request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (response.ok) break;
      if (response.status !== 503 || attempt === SPARQL_503_RETRIES) {
        throw new ApiFetchError(
          "Wikidata",
          response.status,
          `HTTP ${response.status}: ${response.statusText}`,
        );
      }
      await sleep((attempt + 1) * 5000);
    }
    if (!response?.ok) {
      throw new ApiFetchError("Wikidata", response?.status ?? null, "SPARQL request did not succeed.");
    }
    const json = (await response.json()) as SparqlResponse;
    for (const row of json.results?.bindings ?? []) {
      const mbid = row.mbid?.value;
      if (!mbid) continue;
      if (!byMbid.has(mbid)) byMbid.set(mbid, []);
      const image = row.image?.value;
      if (image) byMbid.get(mbid)!.push({ image, rank: row.rank?.value ?? null });
    }
  }

  return byMbid;
}

/**
 * Deterministic multi-`P18` selection rule:
 *   1. Prefer a preferred-ranked statement when one exists.
 *   2. Otherwise (and to break ties among multiple preferred statements) choose
 *      the candidate with the lexicographically smallest canonical Commons file
 *      name. This is stable across runs and independent of SPARQL row order.
 */
export function selectArtistImage(
  candidates: readonly ArtistImageCandidate[],
): ArtistImageCandidate | null {
  if (candidates.length === 0) return null;

  const preferred = candidates.filter((c) => c.rank === PREFERRED_RANK);
  const pool = preferred.length > 0 ? preferred : candidates;

  const sorted = [...pool].sort((a, b) => {
    const nameA = commonsFileNameFromImageUrl(a.image) ?? a.image;
    const nameB = commonsFileNameFromImageUrl(b.image) ?? b.image;
    if (nameA === nameB) return 0;
    return nameA < nameB ? -1 : 1;
  });

  return sorted[0];
}

// ─── Commons metadata ─────────────────────────────────────────────────────────

/**
 * Retrieve Commons metadata for a single file. Returns null when the file is
 * missing or the lookup fails; a single failure never fails the category.
 */
async function fetchCommonsMetadata(
  fileName: string,
): Promise<ArtistImage | null> {
  const title = `File:${fileName}`;
  const url =
    `${COMMONS_API_ENDPOINT}?action=query&format=json&prop=imageinfo` +
    `&iiprop=url|extmetadata|mime|size&titles=${encodeURIComponent(title)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(COMMONS_TIMEOUT_MS),
      next: { revalidate: REVALIDATE },
    });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let json: CommonsQueryResponse;
  try {
    json = (await res.json()) as CommonsQueryResponse;
  } catch {
    return null;
  }

  const pages = json.query?.pages ?? {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;

  const info = page.imageinfo?.[0];
  if (!info) return null;

  const ext = info.extmetadata ?? {};
  const pick = (key: string): string | null =>
    stripHtml(ext[key]?.value ?? null);

  const license = pick("LicenseShortName") ?? pick("License");
  const licenseUrl = pick("LicenseUrl");
  const author = pick("Artist") ?? pick("Credit");

  // Prefer the explicit AttributionRequired flag; fall back to the license
  // family. Unknown licenses are treated as attribution-required.
  const explicitFlag = pick("AttributionRequired");
  const attributionRequired =
    explicitFlag === "true"
      ? true
      : explicitFlag === "false"
        ? false
        : licenseRequiresAttribution(license);

  const attribution = buildAttribution(
    author,
    license,
    licenseUrl,
    attributionRequired,
  );

  return {
    imageUrl: commonsFilePathUrl(fileName),
    fileName,
    license,
    licenseUrl,
    author,
    attributionRequired,
    attribution,
  };
}

/**
 * Resolve Commons metadata for a list of file names with a small bounded
 * concurrency. Results are returned in the same order as the input; a failed
 * lookup yields null.
 */
async function fetchCommonsMetadataBounded(
  fileNames: readonly string[],
): Promise<(ArtistImage | null)[]> {
  const results: (ArtistImage | null)[] = new Array(fileNames.length).fill(null);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= fileNames.length) return;
      results[index] = await fetchCommonsMetadata(fileNames[index]);
    }
  }

  const workerCount = Math.min(COMMONS_CONCURRENCY, fileNames.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve genuine artist images for the curated MBID pool.
 *
 * Performs ONE batched SPARQL request for all MBIDs, applies the deterministic
 * multi-`P18` selection rule, then retrieves Commons metadata for each selected
 * image (bounded concurrency). Returns a map of MBID -> `ArtistImage`. An MBID
 * with no resolvable image is simply absent from the map; the caller decides
 * how to handle it.
 *
 * Throws `ApiFetchError` when the batched SPARQL request fails, so the caller
 * fails closed rather than emitting a partial pool.
 */
export async function resolveArtistImagesWithDiagnostics(
  mbids: readonly string[],
): Promise<ArtistImageResolution> {
  const resolved = new Map<string, ArtistImage>();
  if (mbids.length === 0) {
    return {
      images: resolved,
      mbidsWithP18: 0,
      missingP18: 0,
      commonsMetadataFailures: 0,
      licenseAttribution: {
        attributionRequired: 0,
        attributionNotRequired: 0,
        unknownLicense: 0,
        requiredButNoCredit: 0,
      },
    };
  }

  const candidatesByMbid = await fetchArtistImageCandidates(
    [...new Set(mbids)],
  );

  // Deterministic selection per MBID, preserving the input MBID order.
  const selected: { mbid: string; fileName: string }[] = [];
  for (const mbid of mbids) {
    const candidates = candidatesByMbid.get(mbid) ?? [];
    const chosen = selectArtistImage(candidates);
    if (!chosen) continue;
    const fileName = commonsFileNameFromImageUrl(chosen.image);
    if (!fileName) continue;
    selected.push({ mbid, fileName });
  }

  const metadata = await fetchCommonsMetadataBounded(
    selected.map((s) => s.fileName),
  );

  let attributionRequired = 0;
  let attributionNotRequired = 0;
  let unknownLicense = 0;
  let requiredButNoCredit = 0;
  for (let i = 0; i < selected.length; i++) {
    const meta = metadata[i];
    if (!meta) continue;
    if (meta.attributionRequired) attributionRequired += 1;
    else attributionNotRequired += 1;
    if (!meta.license) unknownLicense += 1;
    if (meta.attributionRequired && !meta.attribution) requiredButNoCredit += 1;
    resolved.set(selected[i].mbid, meta);
  }

  return {
    images: resolved,
    mbidsWithP18: selected.length,
    missingP18: Math.max(0, mbids.length - selected.length),
    commonsMetadataFailures: metadata.filter((entry) => entry === null).length,
    licenseAttribution: {
      attributionRequired,
      attributionNotRequired,
      unknownLicense,
      requiredButNoCredit,
    },
  };
}

export async function resolveArtistImages(
  mbids: readonly string[],
): Promise<Map<string, ArtistImage>> {
  return (await resolveArtistImagesWithDiagnostics(mbids)).images;
}

// Re-exported for the measurement/diagnostic path only.
export { sleep };
