/**
 * CheapShark fetcher — Game Ratings (Metacritic scores)
 *
 * Endpoint: https://www.cheapshark.com/api/1.0/deals?storeID=1&sortBy=Metacritic
 * No API key required.
 *
 * GameItem mapping:
 *   id           = dealID
 *   name         = title
 *   imageUrl     = thumb
 *   value        = parseInt(metacriticScore, 10)  (0–100 scale)
 *   displayValue = "${metacriticScore} / 100"
 */

import { GameItem, ApiFetchError } from "@/types/api";

// ─── Raw API types ────────────────────────────────────────────────────────────

interface CheapSharkDeal {
  dealID: string;
  gameID: string;
  title: string;
  thumb: string;
  /** Metacritic score as a string; "0" or "" means unrated */
  metacriticScore: string;
  salePrice: string;
  normalPrice: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.cheapshark.com/api/1.0";
/**
 * Fetch multiple pages so we have a big, varied pool.
 * CheapShark supports `pageNumber` (0-indexed) and `pageSize` (max 60).
 */
const PAGE_SIZE = 60;
const PAGES_TO_FETCH = 3; // ≈ 180 candidates before filtering

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export async function fetchGameRatings(): Promise<GameItem[]> {
  const pageRequests = Array.from({ length: PAGES_TO_FETCH }, (_, i) => {
    const params = new URLSearchParams({
      storeID: "1",          // Steam
      sortBy: "Metacritic",
      pageSize: String(PAGE_SIZE),
      pageNumber: String(i),
    });
    return fetch(`${BASE_URL}/deals?${params.toString()}`, {
      // Ratings change infrequently — cache for 6 hours
      next: { revalidate: 60 * 60 * 6 },
    });
  });

  const responses = await Promise.all(pageRequests);

  const deals: CheapSharkDeal[] = [];
  for (const res of responses) {
    if (!res.ok) {
      throw new ApiFetchError(
        "CheapShark",
        res.status,
        `HTTP ${res.status}: ${res.statusText}`,
      );
    }
    const data: CheapSharkDeal[] = await res.json();
    deals.push(...data);
  }

  return deals
    .filter(
      (d) =>
        d.metacriticScore &&          // not empty string
        d.metacriticScore !== "0" &&  // not explicitly zero (unrated)
        d.title &&
        d.thumb,
    )
    .map<GameItem>((d) => {
      const score = parseInt(d.metacriticScore, 10);
      return {
        id: d.dealID,
        name: d.title,
        imageUrl: d.thumb,
        value: score,
        displayValue: `${score} / 100`,
      };
    });
}
