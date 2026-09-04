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
import { fetchMovieRatings } from "./tmdb";
import { fetchGamePlayerbase } from "./steamspy";
import { fetchGameRatings } from "./cheapshark"; // replaced RAWG — no API key needed
import { fetchItemPrices } from "./fakestoreapi";

// ─── Re-exports for convenience ───────────────────────────────────────────────
export type { GameItem } from "@/types/api";
export { ApiFetchError } from "@/types/api";

// ─── Fetcher map ──────────────────────────────────────────────────────────────

type FetcherFn = () => Promise<GameItem[]>;

const FETCHER_MAP: Record<CategoryId, FetcherFn> = {
  "movie-ratings": fetchMovieRatings,
  "game-playerbase": fetchGamePlayerbase,
  "game-ratings": fetchGameRatings,
  "item-prices": fetchItemPrices,
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
  const fetcher = FETCHER_MAP[categoryId as CategoryId];

  if (!fetcher) {
    throw new Error(
      `Unknown categoryId: "${categoryId}". ` +
        `Valid values are: ${Object.keys(FETCHER_MAP).join(", ")}`,
    );
  }

  const items = await fetcher();

  if (items.length < 2) {
    throw new Error(
      `Category "${categoryId}" returned fewer than 2 items — cannot play.`,
    );
  }

  // Fisher-Yates shuffle so the deck is random on every call
  return shuffle(items);
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
