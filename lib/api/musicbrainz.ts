/**
 * MusicBrainz fetchers
 *
 * Endpoints:
 *   https://musicbrainz.org/ws/2/release-group?artist=<mbid>&type=album&fmt=json
 *   https://coverartarchive.org/release-group/<mbid>/front
 * No API key required.
 *
 * Fetchers:
 *   fetchArtistAlbumCounts()  → provider key "artist-album-counts"
 *   fetchAlbumReleaseDates()  → provider key "album-release-dates"
 *
 * Both iterate the curated static artist MBID pool (Decision C) by default.
 * The album-release-date pool additionally exposes a bounded target-fill
 * generator (`generateAlbumReleaseDates()`) that accepts an exact discovered
 * artist list and stops at a configurable generation target. It reuses the
 * same MusicBrainz browse + Cover Art Archive path; it is not a parallel
 * provider architecture.
 *
 * Rate limits (verified): maximum ONE request per second; a descriptive
 * User-Agent is required. Requests are therefore serialized with ≥1s spacing.
 *
 * GameItem mapping:
 *   artist-album-counts: value = count of primary-type Album release groups
 *                        across ALL pages; displayValue = "N albums".
 *                        Represents an ARTIST, not an album. The artist image
 *                        is resolved from Wikidata `P434` -> `P18` (see
 *                        `wikidataArtistImages.ts`); items without a resolvable
 *                        genuine artist image are dropped.
 *   album-release-dates: value = deterministic numeric key derived from the
 *                        source date without inventing precision;
 *                        displayValue = the original source string.
 */

import { GameItem, ApiFetchError } from "@/types/api";
import { CURATED_ARTISTS } from "./curatedPools";
import { resolveArtistImagesWithDiagnostics } from "./wikidataArtistImages";

// ─── Raw API types ────────────────────────────────────────────────────────────

interface MbReleaseGroup {
  id: string;
  title: string;
  /** May be "YYYY", "YYYY-MM", or "YYYY-MM-DD"; may be absent. */
  "first-release-date"?: string;
  /** "Album", "Single", "EP", etc. */
  "primary-type"?: string | null;
}

interface MbReleaseGroupBrowse {
  "release-group-count": number;
  "release-group-offset": number;
  "release-groups": MbReleaseGroup[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MB_BASE = "https://musicbrainz.org/ws/2";
const COVER_ART_BASE = "https://coverartarchive.org";
/** MusicBrainz requires a descriptive User-Agent (a constant, not a secret). */
const USER_AGENT = "HigherLower/0.1 (https://github.com/higherlower)";
/** Browse page size; MusicBrainz default is 25, maximum is 100. */
const PAGE_LIMIT = 100;
/**
 * Minimum spacing between MusicBrainz API requests to respect the provider's
 * one-request-per-second limit. This pacing applies ONLY to `musicbrainz.org`
 * calls. Cover Art Archive resolution is a separate host with no such limit
 * and must NOT inherit this sleep.
 */
const MUSICBRAINZ_REQUEST_SPACING_MS = 1100;
const MUSICBRAINZ_503_RETRIES = 2;
/** Release data is stable; cache for a week. */
const REVALIDATE = 60 * 60 * 24 * 7;
/**
 * Bound the number of release groups per artist for which we resolve cover art.
 * Cover-art lookups are the dominant cost (one request each), so an unbounded
 * pass over a prolific artist's catalogue would make a request-time fetch
 * impractically slow. A bounded sample keeps the fetch predictable while still
 * yielding a diverse pool.
 *
 * This is also the per-artist diversity cap: it prevents a single prolific
 * artist from dominating the album pool. It is deliberately simple and
 * deterministic (no weighting).
 */
const MAX_RELEASE_GROUPS_PER_ARTIST = 12;
/**
 * Default generation target for the album-release-date pool.
 *
 * This is a bounded generation budget, NOT a product cap and NOT the ~50
 * readiness floor. It exists so the developer-run generator stops once it has
 * accumulated a comfortably deep, diverse pool instead of exhaustively crawling
 * every discovered artist (which would be an unnecessarily long run). The
 * measured Phase 4 diagnostic showed ~10 usable albums per artist, so ~200
 * items is reached in roughly 20–25 artists — a few minutes of paced requests.
 *
 * The value is configurable per generation call; the default is used by the
 * live adapter's own bounded path.
 */
const DEFAULT_ALBUM_ITEMS_TARGET = 200;
/**
 * Legacy hard cap retained for the live adapter's default (seed-only) path so
 * its behavior is unchanged. The bounded target-fill generator uses
 * `DEFAULT_ALBUM_ITEMS_TARGET` instead.
 */
const MAX_ALBUM_ITEMS = 120;
/**
 * Maximum simultaneous Cover Art Archive lookups. CAA has no documented
 * one-request-per-second limit, so a small bounded concurrency is safe and
 * keeps the fetch responsive. This is deliberately small and applies ONLY to
 * CAA; MusicBrainz requests remain fully serialized.
 */
const CAA_CONCURRENCY = 4;
/**
 * Finite timeout for a single Cover Art Archive lookup. An unreachable CAA
 * host must not be able to hang the category for minutes; a timed-out lookup
 * is treated as an unusable image and filtered out.
 */
const CAA_TIMEOUT_MS = 5000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a MusicBrainz browse page for an artist's album release groups.
 * Serialized by the caller; this helper performs a single request.
 */
async function fetchReleaseGroupPage(
  artistMbid: string,
  offset: number,
): Promise<MbReleaseGroupBrowse> {
  const url =
    `${MB_BASE}/release-group?artist=${artistMbid}` +
    `&type=album&fmt=json&limit=${PAGE_LIMIT}&offset=${offset}`;

  let res: Response | undefined;
  for (let attempt = 0; attempt <= MUSICBRAINZ_503_RETRIES; attempt += 1) {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: REVALIDATE },
    });
    if (res.ok) break;
    if (res.status !== 503 || attempt === MUSICBRAINZ_503_RETRIES) {
      throw new ApiFetchError(
        "MusicBrainz",
        res.status,
        `HTTP ${res.status}: ${res.statusText}`,
      );
    }
    await sleep((attempt + 1) * 5000);
  }

  if (!res?.ok) throw new ApiFetchError("MusicBrainz", res?.status ?? null, "Request did not succeed.");

  return (await res.json()) as MbReleaseGroupBrowse;
}

/**
 * Page through ALL album release groups for an artist. Increments offset by the
 * actual number of records received (MusicBrainz may return fewer than
 * requested) and stops when the reported count is reached or a page is empty.
 */
async function fetchAllAlbumReleaseGroups(
  artistMbid: string,
): Promise<MbReleaseGroup[]> {
  const all: MbReleaseGroup[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const page = await fetchReleaseGroupPage(artistMbid, offset);
    const groups = page["release-groups"] ?? [];
    total = page["release-group-count"] ?? groups.length;

    if (groups.length === 0) break;
    all.push(...groups);
    offset += groups.length;

    // Respect the MusicBrainz 1 req/s limit before the next page request.
    if (offset < total) await sleep(MUSICBRAINZ_REQUEST_SPACING_MS);
  }

  return all;
}

/**
 * Resolve a Cover Art Archive front image URL for a release group.
 *
 * The endpoint responds with a redirect (307) whose `Location` header points at
 * the actual image (an archive.org URL). We deliberately do NOT follow the
 * redirect: following it makes the runtime download the entire full-resolution
 * image body (observed 7–22 MB per cover) merely to read the final URL, which
 * is the dominant cost of this fetcher and cannot be cached (bodies exceed the
 * runtime's cache size limit). Reading the `Location` header instead transfers
 * only the tiny redirect response (~134 bytes).
 *
 * The endpoint supports `HEAD`, and the only information required is the
 * redirect `Location`, so a `HEAD` request with `redirect: "manual"` is used.
 * A finite timeout bounds an unreachable host so it cannot hang the category.
 *
 * This is a Cover Art Archive request, NOT a MusicBrainz request, so it does
 * NOT inherit the MusicBrainz one-request-per-second pacing.
 *
 * A missing cover returns a non-2xx response (typically 404). Returns null when
 * no usable absolute cover URL is available, when the response is not a
 * redirect, when `Location` is missing, or when the lookup times out.
 */
async function resolveCoverArtUrl(releaseGroupMbid: string): Promise<string | null> {
  const url = `${COVER_ART_BASE}/release-group/${releaseGroupMbid}/front`;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      // Do not download the image body; read the redirect target instead.
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT },
      // Bound an unreachable/slow host; a timeout is treated as unusable.
      signal: AbortSignal.timeout(CAA_TIMEOUT_MS),
      next: { revalidate: REVALIDATE },
    });

    // Accept the expected redirect response (307, or 301/302/303/308).
    const isRedirect =
      res.status === 307 ||
      res.status === 301 ||
      res.status === 302 ||
      res.status === 303 ||
      res.status === 308;
    if (!isRedirect) return null;

    const location = res.headers.get("location");
    if (!location) return null;

    // Normalize a relative Location against the CAA request URL if necessary.
    let absolute: string;
    try {
      absolute = new URL(location, url).toString();
    } catch {
      return null;
    }

    // Ensure the result is a valid absolute HTTP/HTTPS URL.
    let parsed: URL;
    try {
      parsed = new URL(absolute);
    } catch {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    return absolute;
  } catch {
    // Network error, timeout, or abort — treat as an unusable image.
    return null;
  }
}

/**
 * Resolve Cover Art Archive URLs for a list of release-group MBIDs using a
 * small bounded concurrency (CAA_CONCURRENCY). This is a simple in-adapter
 * worker pool — no queue, worker system, or new infrastructure. Results are
 * returned in the same order as the input MBIDs; a failed lookup yields null.
 *
 * Only Cover Art Archive requests run concurrently. MusicBrainz requests are
 * never issued from here and remain fully serialized by their callers.
 */
async function resolveCoverArtUrlsBounded(
  mbids: readonly string[],
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(mbids.length).fill(null);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= mbids.length) return;
      results[index] = await resolveCoverArtUrl(mbids[index]);
    }
  }

  const workerCount = Math.min(CAA_CONCURRENCY, mbids.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

/**
 * Deterministic numeric comparison key from a partial date string, without
 * inventing precision. A year-only date sorts before any month/day within that
 * year. Returns null when no year can be parsed.
 */
function dateComparisonKey(date: string): number | null {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(date.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 0;
  const day = match[3] ? Number(match[3]) : 0;
  return year * 10000 + month * 100 + day;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

/**
 * Number of albums per curated artist. Counts release groups whose
 * `primary-type === "Album"` across ALL pages.
 *
 * This metric represents an ARTIST, not an album. Truthful artist imagery is
 * resolved from Wikidata `P434` (MusicBrainz artist ID) -> `P18` (image) via a
 * single batched SPARQL request for the whole curated pool (see
 * `wikidataArtistImages.ts`). A random album's artwork is never used as the
 * artist image. Items whose genuine artist image cannot be resolved are dropped
 * (the dispatcher would drop them anyway for a missing `imageUrl`).
 *
 * The Wikidata/Commons lookup is a separate host with no one-request-per-second
 * contract, so it does NOT inherit the MusicBrainz pacing. The MusicBrainz
 * browse requests remain fully serialized at 1 req/s.
 */
export interface ArtistAlbumCountsGenerationResult {
  readonly items: GameItem[];
  readonly candidates: number;
  readonly missingP18: number;
  readonly commonsMetadataFailures: number;
  readonly missingImages: number;
  readonly countedArtists: number;
  readonly licenseAttribution: {
    readonly attributionRequired: number;
    readonly attributionNotRequired: number;
    readonly unknownLicense: number;
    readonly requiredButNoCredit: number;
  };
}

/**
 * Generate Number of Albums items for an exact artist list. The default keeps
 * the existing seed behavior; developer discovery passes validated MBIDs.
 */
export async function generateArtistAlbumCounts(
  artists: readonly { readonly mbid: string; readonly name: string }[] = CURATED_ARTISTS,
): Promise<ArtistAlbumCountsGenerationResult> {
  // Resolve genuine artist images for the whole curated pool in one batched
  // Wikidata request before the (slow, serialized) MusicBrainz browse phase.
  const imageResolution = await resolveArtistImagesWithDiagnostics(
    artists.map((a) => a.mbid),
  );
  const artistImages = imageResolution.images;

  const items: GameItem[] = [];
  let missingImages = 0;
  let countedArtists = 0;

  for (let i = 0; i < artists.length; i++) {
    const artist = artists[i];
    const groups = await fetchAllAlbumReleaseGroups(artist.mbid);
    const albumCount = groups.filter(
      (g) => g["primary-type"] === "Album",
    ).length;
    countedArtists += 1;

    const image = artistImages.get(artist.mbid);
    // No truthful artist image -> drop the item rather than emit a broken card.
    if (!image) {
      missingImages += 1;
      if (i < artists.length - 1) {
        await sleep(MUSICBRAINZ_REQUEST_SPACING_MS);
      }
      continue;
    }

    items.push({
      id: artist.mbid,
      name: artist.name,
      imageUrl: image.imageUrl,
      value: albumCount,
      displayValue: `${albumCount} albums`,
      // Surface the credit line only when the image's license requires it.
      ...(image.attribution ? { attribution: image.attribution } : {}),
    });

    // Space out artist iterations to respect the MusicBrainz rate limit.
    if (i < artists.length - 1) {
      await sleep(MUSICBRAINZ_REQUEST_SPACING_MS);
    }
  }

  return {
    items,
    candidates: artists.length,
    missingP18: imageResolution.missingP18,
    commonsMetadataFailures: imageResolution.commonsMetadataFailures,
    missingImages,
    countedArtists,
    licenseAttribution: imageResolution.licenseAttribution,
  };
}

export async function fetchArtistAlbumCounts(): Promise<GameItem[]> {
  return (await generateArtistAlbumCounts()).items;
}

/**
 * Generation diagnostics for the album-release-date pool. Counts only — never
 * artist names, MBIDs, image URLs, or response bodies.
 */
export interface AlbumReleaseDatesGenerationResult {
  readonly items: GameItem[];
  /** Artists supplied as candidates. */
  readonly candidates: number;
  /** Artists actually crawled before the target/budget was reached. */
  readonly artistsCrawled: number;
  /** Release groups inspected across crawled artists. */
  readonly releaseGroupsInspected: number;
  /** Candidate release groups with a usable first-release-date. */
  readonly recordsWithDates: number;
  /** Release groups rejected for a missing first-release-date. */
  readonly missingDate: number;
  /** Cover Art Archive lookups issued. */
  readonly caaRequests: number;
  /** CAA lookups that resolved to a usable absolute image URL. */
  readonly caaSuccess: number;
  /** CAA lookups that returned a genuine no-cover response (typically 404). */
  readonly caaMissing: number;
  /** CAA lookups that failed (timeout, network error, non-redirect). */
  readonly caaFailures: number;
  /** Final unique album items emitted. */
  readonly emitted: number;
  /** Distinct artists represented in the emitted pool. */
  readonly artistsRepresented: number;
  /** Largest number of emitted albums contributed by a single artist. */
  readonly maxAlbumsPerArtist: number;
}

/**
 * Bounded target-fill generator for the album-release-date pool.
 *
 * Each gameplay item is a release group (album): exact release-group MBID,
 * album title, `first-release-date` preserved verbatim in `displayValue`, a
 * deterministic numeric comparison key that never invents missing month/day,
 * and a real Cover Art Archive album cover.
 *
 * Bounded behavior (Phase 4):
 *   - Artists are deterministically ordered (stable MBID sort) so the run is
 *     reproducible and reviewable.
 *   - Per artist, at most `MAX_RELEASE_GROUPS_PER_ARTIST` release groups are
 *     sampled, keeping any single prolific artist from dominating the pool.
 *   - Generation stops once `targetItems` unique albums are accumulated or the
 *     artist list is exhausted — a bounded budget, not an exhaustive crawl.
 *   - MusicBrainz browse requests remain fully serialized at ≥1.1 s; CAA
 *     lookups use the existing bounded concurrency and finite timeout.
 *
 * Deduplication is by release-group MBID only. Titles are NOT used as an
 * identity key: different artists can share a title, and distinct release
 * groups may legitimately differ.
 */
export async function generateAlbumReleaseDates(
  artists: readonly { readonly mbid: string; readonly name: string }[] = CURATED_ARTISTS,
  options: { readonly targetItems?: number } = {},
): Promise<AlbumReleaseDatesGenerationResult> {
  const targetItems = options.targetItems ?? DEFAULT_ALBUM_ITEMS_TARGET;

  // Deterministic artist ordering: stable MBID sort, name as tie-break.
  const ordered = [...artists].sort((a, b) => {
    if (a.mbid !== b.mbid) return a.mbid < b.mbid ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  const items: GameItem[] = [];
  const seen = new Set<string>();
  const perArtistCount = new Map<string, number>();

  let artistsCrawled = 0;
  let releaseGroupsInspected = 0;
  let recordsWithDates = 0;
  let missingDate = 0;
  let caaRequests = 0;
  let caaSuccess = 0;
  let caaMissing = 0;
  let caaFailures = 0;

  for (let i = 0; i < ordered.length; i++) {
    if (items.length >= targetItems) break;

    const artist = ordered[i];
    artistsCrawled += 1;

    // MusicBrainz browse requests remain fully serialized (1 req/s pacing).
    const groups = await fetchAllAlbumReleaseGroups(artist.mbid);
    releaseGroupsInspected += groups.length;

    // Select this artist's bounded candidate sample, then resolve their Cover
    // Art Archive URLs with bounded concurrency. CAA is a separate host with
    // no 1 req/s limit, so it does NOT inherit the MusicBrainz sleep.
    const candidates: { group: MbReleaseGroup; value: number; date: string }[] =
      [];
    for (const group of groups) {
      if (candidates.length >= MAX_RELEASE_GROUPS_PER_ARTIST) break;
      if (items.length + candidates.length >= targetItems) break;

      const date = group["first-release-date"];
      if (!date) {
        missingDate += 1;
        continue;
      }
      if (seen.has(group.id)) continue;

      const value = dateComparisonKey(date);
      if (value === null) continue;

      recordsWithDates += 1;
      candidates.push({ group, value, date });
    }

    const imageUrls = await resolveCoverArtUrlsBounded(
      candidates.map((c) => c.group.id),
    );

    for (let c = 0; c < candidates.length; c++) {
      caaRequests += 1;
      const imageUrl = imageUrls[c];
      // A failed, timed-out, non-redirect, or missing-Location lookup is an
      // unusable image and is filtered out. One CAA failure never fails the
      // category.
      if (!imageUrl) {
        caaMissing += 1;
        continue;
      }
      caaSuccess += 1;

      const { group, value, date } = candidates[c];
      seen.add(group.id);
      perArtistCount.set(artist.mbid, (perArtistCount.get(artist.mbid) ?? 0) + 1);
      items.push({
        id: group.id,
        name: group.title,
        imageUrl,
        value,
        displayValue: date, // preserve source precision
      });
    }

    // Space out artist iterations to respect the MusicBrainz rate limit.
    if (i < ordered.length - 1 && items.length < targetItems) {
      await sleep(MUSICBRAINZ_REQUEST_SPACING_MS);
    }
  }

  // CAA failures are the residual: lookups that neither resolved nor returned a
  // genuine no-cover response (timeouts, network errors, non-redirects).
  caaFailures = caaRequests - caaSuccess - caaMissing;

  const perArtistValues = [...perArtistCount.values()];

  return {
    items,
    candidates: ordered.length,
    artistsCrawled,
    releaseGroupsInspected,
    recordsWithDates,
    missingDate,
    caaRequests,
    caaSuccess,
    caaMissing,
    caaFailures,
    emitted: items.length,
    artistsRepresented: perArtistCount.size,
    maxAlbumsPerArtist: perArtistValues.length ? Math.max(...perArtistValues) : 0,
  };
}

/**
 * Album release dates. One item per release group across the curated artists.
 * `displayValue` preserves the original source string (e.g. "1998", "2012-05").
 * Items without a resolvable Cover Art Archive image are dropped.
 *
 * This is the live adapter's default (seed-only) path. It preserves the
 * historical `MAX_ALBUM_ITEMS = 120` bound so the existing live behavior is
 * unchanged; the developer-run generator uses `generateAlbumReleaseDates()`
 * with an explicit bounded target instead.
 */
export async function fetchAlbumReleaseDates(): Promise<GameItem[]> {
  const result = await generateAlbumReleaseDates(CURATED_ARTISTS, {
    targetItems: MAX_ALBUM_ITEMS,
  });
  return result.items;
}
