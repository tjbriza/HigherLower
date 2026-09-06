/**
 * CheapShark fetcher — Game Ratings (Metacritic scores)
 *
 * Endpoint: https://www.cheapshark.com/api/1.0/deals?storeID=1&sortBy=Metacritic
 * No API key required.
 *
 * GameItem mapping:
 *   id           = dealID
 *   name         = title
 *   imageUrl     = thumb  (from shared.fastly.steamstatic.com or similar CDN edges)
 *   value        = parseInt(metacriticScore, 10)  (0–100 scale)
 *   displayValue = "${score} / 100"
 */

import { GameItem, ApiFetchError } from "@/types/api";

// ─── Raw API types ────────────────────────────────────────────────────────────

interface CheapSharkDeal {
  dealID: string;
  gameID: string;
  title: string;
  /** Thumbnail URL — may come from any Steam CDN edge (fastly / akamai / cloudflare) */
  thumb: string;
  /** Metacritic score as a string; "0" or "" means unrated */
  metacriticScore: string;
  salePrice: string;
  normalPrice: string;
  steamAppID?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.cheapshark.com/api/1.0";
const PAGE_SIZE = 60;     // CheapShark max per request
const PAGES_TO_FETCH = 3; // ≈ 180 raw candidates before filtering
const MIN_SCORE = 1;      // discard anything that parsed to 0 or NaN
const MIN_ITEMS = 15;     // guarantee a playable pool

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUrl(pageNumber: number): string {
  const params = new URLSearchParams({
    storeID: "1",         // Steam store
    sortBy: "Metacritic",
    pageSize: String(PAGE_SIZE),
    pageNumber: String(pageNumber),
  });
  return `${BASE_URL}/deals?${params.toString()}`;
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export async function fetchGameRatings(): Promise<GameItem[]> {
  // Use allSettled so a single rate-limited page doesn't abort the whole fetch
  const results = await Promise.allSettled(
    Array.from({ length: PAGES_TO_FETCH }, (_, i) =>
      fetch(buildUrl(i), {
        // Metacritic scores are stable — cache 6 hours
        next: { revalidate: 60 * 60 * 6 },
      }),
    ),
  );

  const deals: CheapSharkDeal[] = [];

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[CheapShark] A page fetch was rejected (network error):", result.reason);
      continue; // skip this page, try the rest
    }

    const res = result.value;

    if (!res.ok) {
      console.warn(`[CheapShark] Page returned HTTP ${res.status} — skipping`);
      continue; // skip bad pages gracefully instead of throwing
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      console.warn("[CheapShark] Could not parse JSON from a page — skipping");
      continue;
    }

    if (!Array.isArray(data)) {
      console.warn("[CheapShark] Unexpected response shape — skipping");
      continue;
    }

    deals.push(...(data as CheapSharkDeal[]));
  }

  console.log(`[CheapShark] Raw deals collected across all pages: ${deals.length}`);

  const items = deals
    .filter((d) => {
      if (!d.title || typeof d.title !== "string") return false;
      if (!d.thumb || typeof d.thumb !== "string") return false;
      if (!d.dealID) return false;
      if (!d.metacriticScore || d.metacriticScore === "0") return false;
      const score = parseInt(d.metacriticScore, 10);
      if (isNaN(score) || score < MIN_SCORE) return false;
      return true;
    })
    .map<GameItem>((d) => {
      const score = parseInt(d.metacriticScore, 10);
      return {
        id: d.dealID,
        name: d.title.trim(),
        imageUrl: d.thumb,
        value: score,
        displayValue: `${score} / 100`,
      };
    });

  console.log(`[CheapShark] Valid items after filtering: ${items.length}`);

  if (items.length < MIN_ITEMS) {
    throw new ApiFetchError(
      "CheapShark",
      null,
      `Only ${items.length} valid game ratings returned (need at least ${MIN_ITEMS}). ` +
        "CheapShark may be temporarily rate-limiting or unavailable.",
    );
  }

  return items;
}
