/**
 * RAWG fetcher — Game Ratings
 *
 * Endpoint: https://api.rawg.io/api/games
 * Requires:  RAWG_API_KEY  (server-only env var, no NEXT_PUBLIC_ prefix)
 *
 * GameItem mapping:
 *   value        = rating  (0–5 scale, community average)
 *   displayValue = "${rating} / 5"
 */

import { GameItem, ApiFetchError } from "@/types/api";

// ─── Raw API types ────────────────────────────────────────────────────────────

interface RawgGame {
  id: number;
  name: string;
  background_image: string | null;
  rating: number;
  ratings_count: number;
}

interface RawgResponse {
  results: RawgGame[];
  next: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.rawg.io/api";

/**
 * Fetch games with a high rating threshold and multiple pages so the pool
 * has enough variety.  RAWG returns 20 results per page by default.
 */
const PAGES_TO_FETCH = 5;
const PAGE_SIZE = 20;
/** Only include games with a community rating of at least 3.5 / 5 */
const MIN_RATING = 3.5;
/** Require at least this many ratings to avoid obscure titles */
const MIN_RATING_COUNT = 50;

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export async function fetchGameRatings(): Promise<GameItem[]> {
  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    throw new ApiFetchError(
      "RAWG",
      null,
      "RAWG_API_KEY is not set. Add it to your .env.local file.",
    );
  }

  const params = new URLSearchParams({
    key: apiKey,
    ordering: "-rating",
    page_size: String(PAGE_SIZE),
    // Exclude platforms with fewer titles so images are more reliable
    exclude_additions: "true",
  });

  const pageRequests = Array.from({ length: PAGES_TO_FETCH }, (_, i) => {
    const url = `${BASE_URL}/games?${params.toString()}&page=${i + 1}`;
    return fetch(url, { next: { revalidate: 60 * 60 * 6 } });
  });

  const responses = await Promise.all(pageRequests);

  const games: RawgGame[] = [];
  for (const res of responses) {
    if (!res.ok) {
      throw new ApiFetchError("RAWG", res.status, `HTTP ${res.status}: ${res.statusText}`);
    }
    const data: RawgResponse = await res.json();
    games.push(...data.results);
  }

  return games
    .filter(
      (g) =>
        g.background_image !== null &&   // must have cover art
        g.rating >= MIN_RATING &&         // reasonable quality threshold
        g.ratings_count >= MIN_RATING_COUNT,
    )
    .map<GameItem>((g) => ({
      id: g.id,
      name: g.name,
      imageUrl: g.background_image!, // filtered above
      value: Math.round(g.rating * 100) / 100, // 2 decimal places
      displayValue: `${g.rating.toFixed(2)} / 5`,
    }));
}
