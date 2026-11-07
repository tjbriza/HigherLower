/**
 * Central API dispatcher
 *
 * Usage (Server Component or Route Handler):
 *   const items = await fetchGameItems("movie-ratings");
 *
 * Adding a new category:
 *   1. Create a fetcher in lib/api/<name>.ts
 *   2. Add its CategoryId mapping to the FETCHER_MAP below
 */

import { type CategoryId } from "@/types/game";
import { type GameItem } from "@/types/api";
import {
  fetchMovieRatings,
  fetchReleaseDates,
  fetchMovieGrossRevenue,
} from "./tmdb";
import { fetchGamePlayerbase } from "./steamspy";
import { fetchGameRatings } from "./steamspy_ratings"; // Steam review score %, no key needed
import { fetchCountryPopulations } from "./worldbank"; // World Bank Open Data, no key needed
import {
  fetchArtistAlbumCounts,
  fetchAlbumReleaseDates,
} from "./musicbrainz"; // MusicBrainz, no key needed
import { fetchAlbumReleaseDatesFromSnapshot } from "./albumReleaseDateSnapshot"; // local snapshot (generated from MusicBrainz)
import { fetchArtistAlbumCountsFromSnapshot } from "./artistAlbumCountsSnapshot"; // local snapshot (generated from MusicBrainz + Wikidata)
import { fetchYouTubeSubscribers } from "./youtube"; // YouTube Data API, key required
import { fetchGameReleaseDates } from "./igdb"; // IGDB via Twitch OAuth2
import { fetchMonthlyListenersFromSnapshot } from "./monthlyListenersSnapshot";
import { fetchTwitchFollowersFromSnapshot } from "./twitchFollowersSnapshot";

// ─── Re-exports for convenience ───────────────────────────────────────────────
export type { GameItem } from "@/types/api";
export { ApiFetchError } from "@/types/api";

// ─── Fetcher map ──────────────────────────────────────────────────────────────

type FetcherFn = () => Promise<GameItem[]>;

const FETCHER_MAP: Record<CategoryId, FetcherFn> = {
  "movie-ratings": fetchMovieRatings,
  "game-playerbase": fetchGamePlayerbase,
  "game-ratings": fetchGameRatings,
  "country-populations": fetchCountryPopulations,
  "release-dates": fetchReleaseDates,
  "movie-gross-revenue": fetchMovieGrossRevenue,
  // Reads the pre-generated local snapshot instead of performing the
  // request-time MusicBrainz + Wikidata crawl. The live adapter is preserved
  // in `musicbrainz.ts` / `wikidataArtistImages.ts` and is used by the
  // snapshot generator.
  "artist-album-counts": fetchArtistAlbumCountsFromSnapshot,
  // Reads the pre-generated local snapshot instead of performing the
  // request-time MusicBrainz crawl. The live adapter is preserved in
  // `musicbrainz.ts` and is used by the snapshot generator.
  "album-release-dates": fetchAlbumReleaseDatesFromSnapshot,
  "youtube-subscribers": fetchYouTubeSubscribers,
  "game-release-dates": fetchGameReleaseDates,
  // Registered for local validation; availability authorization remains fail-closed.
  "monthly-listeners": fetchMonthlyListenersFromSnapshot,
  "twitch-followers": fetchTwitchFollowersFromSnapshot,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a normalised array of GameItem objects for the requested category.
 *
 * Throws `ApiFetchError` on network or API-key failures so callers can
 * handle error states gracefully.
 *
 * Results are shuffled so each game session presents cards in a different
 * order even when the underlying API returns the same data (cached).
 *
 * @param categoryId - One of the CategoryId union values
 * @returns Shuffled array of at least 2 GameItems (throws if fewer)
 */
export async function fetchGameItems(categoryId: string): Promise<GameItem[]> {
  const items = await fetchGameItemsRaw(categoryId);

  // Fisher-Yates shuffle so the deck is random on every call
  return shuffle(items);
}

/**
 * Returns the full, unshuffled, sanitized `GameItem[]` pool for a category.
 *
 * This is the shared sanitize + minimum-count path used by `fetchGameItems`.
 * It is also the developer-facing entry point used by the snapshot generator
 * (`GET /api/test-fetch?category=<id>&full=1`) so the generated snapshot is
 * deterministic and reviewable rather than randomly ordered.
 *
 * Throws `ApiFetchError` on provider failure and a plain `Error` when the
 * category is unknown or yields fewer than 2 usable items.
 */
export async function fetchGameItemsRaw(
  categoryId: string,
): Promise<GameItem[]> {
  const fetcher = FETCHER_MAP[categoryId as CategoryId];

  if (!fetcher) {
    throw new Error(
      `Unknown categoryId: "${categoryId}". ` +
        `Valid values are: ${Object.keys(FETCHER_MAP).join(", ")}`,
    );
  }

  const rawItems = await fetcher();

  // Sanitize: drop any item missing a usable imageUrl or name
  const items = rawItems.filter(
    (item) => !!item.name && !!item.imageUrl,
  );

  if (items.length < 2) {
    throw new Error(
      `Category "${categoryId}" returned fewer than 2 items — cannot play.`,
    );
  }

  return items;
}

/**
 * Developer-only: run the LIVE MusicBrainz adapter for `album-release-date`
 * and return the full, unshuffled, sanitized pool.
 *
 * This deliberately bypasses the snapshot-backed `FETCHER_MAP` entry so the
 * snapshot generator can (re)build the snapshot from the authoritative live
 * provider. It is used only by the dev-only diagnostic route
 * (`GET /api/test-fetch?category=album-release-dates&full=1`) and is never
 * reached by gameplay. The live adapter is preserved unchanged in
 * `musicbrainz.ts`.
 */
export async function fetchAlbumReleaseDatesLive(): Promise<GameItem[]> {
  const rawItems = await fetchAlbumReleaseDates();
  const items = rawItems.filter((item) => !!item.name && !!item.imageUrl);
  if (items.length < 2) {
    throw new Error(
      `Category "album-release-dates" returned fewer than 2 items — cannot play.`,
    );
  }
  return items;
}

/**
 * Developer-only: run the LIVE MusicBrainz + Wikidata adapter for
 * `number-of-albums` and return the full, unshuffled, sanitized pool.
 *
 * This deliberately bypasses the snapshot-backed `FETCHER_MAP` entry so the
 * snapshot generator can (re)build the snapshot from the authoritative live
 * providers. It is used only by the dev-only diagnostic route
 * (`GET /api/test-fetch?category=artist-album-counts&full=1`) and is never
 * reached by gameplay. The live adapter is preserved unchanged in
 * `musicbrainz.ts` / `wikidataArtistImages.ts`.
 */
export async function fetchArtistAlbumCountsLive(): Promise<GameItem[]> {
  const rawItems = await fetchArtistAlbumCounts();
  const items = rawItems.filter((item) => !!item.name && !!item.imageUrl);
  if (items.length < 2) {
    throw new Error(
      `Category "artist-album-counts" returned fewer than 2 items — cannot play.`,
    );
  }
  return items;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** In-place Fisher-Yates shuffle, returns the same array for convenience */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
