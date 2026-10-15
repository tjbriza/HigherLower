/**
 * IGDB fetcher — Game Release Dates
 *
 * Auth:  POST https://id.twitch.tv/oauth2/token  (client credentials)
 * Query: POST https://api.igdb.com/v4/games
 * Requires: TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET (server-only env vars)
 *
 * Fetcher:
 *   fetchGameReleaseDates() → provider key "game-release-dates"
 *
 * Rate limits (verified): 4 requests/second, up to 8 open requests; exceeding
 * returns HTTP 429. A single bounded games query per fetch keeps volume low.
 *
 * GameItem mapping:
 *   value        = first_release_date (Unix seconds)
 *   displayValue = formatted date
 */

import { GameItem, ApiFetchError } from "@/types/api";

// ─── Raw API types ────────────────────────────────────────────────────────────

interface IgdbGame {
  id: number;
  name: string;
  /** Unix timestamp in seconds; may be absent. */
  first_release_date?: number;
  cover?: {
    /** Protocol-relative URL, e.g. "//images.igdb.com/..."; may be absent. */
    url?: string;
  };
}

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const IGDB_GAMES_URL = "https://api.igdb.com/v4/games";
/**
 * Bounded result count for the deterministic game-selection query.
 *
 * Phase 5 (2026-10-15) measured that a single bounded IGDB request with
 * `limit 200` returns 200 unique games with 0 missing dates and 0 missing
 * covers in ~0.3–0.8 s — the same one-request cost as `limit 100`. The pool
 * was therefore raised from 100 to 200. This is an explicit bounded request
 * budget for this provider operation, not a product-wide catalog cap; the
 * query remains a single bounded request (no unbounded pagination).
 */
const GAME_LIMIT = 200;
/** Release dates are stable; cache for a week. */
const REVALIDATE = 60 * 60 * 24 * 7;
/** Re-acquire the token this many seconds before it actually expires. */
const TOKEN_EXPIRY_SKEW_S = 60 * 60;

// ─── Token cache (module scope) ───────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new ApiFetchError(
      "IGDB",
      null,
      "TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET are not set. Add them to your .env.local file.",
    );
  }

  const url =
    `${TWITCH_TOKEN_URL}?client_id=${clientId}` +
    `&client_secret=${clientSecret}&grant_type=client_credentials`;

  const res = await fetch(url, { method: "POST", cache: "no-store" });
  if (!res.ok) {
    throw new ApiFetchError(
      "IGDB",
      res.status,
      `Token request failed: HTTP ${res.status}: ${res.statusText}`,
    );
  }

  const data: TwitchTokenResponse = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in - TOKEN_EXPIRY_SKEW_S) * 1000,
  };
  return cachedToken.token;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize an IGDB cover URL: prefix the protocol-relative URL with `https:`
 * and upscale the size segment to `t_cover_big`.
 */
function normalizeCoverUrl(url: string): string {
  const absolute = url.startsWith("//") ? `https:${url}` : url;
  return absolute.replace(/\/t_[a-z_]+\//, "/t_cover_big/");
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export async function fetchGameReleaseDates(): Promise<GameItem[]> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    throw new ApiFetchError(
      "IGDB",
      null,
      "TWITCH_CLIENT_ID is not set. Add it to your .env.local file.",
    );
  }

  const token = await getAccessToken();

  // Deterministic, bounded selection: games with a cover, ordered by total
  // rating count descending so the pool is stable and well-known rather than
  // relying on unspecified/default result ordering.
  const body =
    `fields name,first_release_date,cover.url;` +
    `where cover != null & first_release_date != null;` +
    `sort total_rating_count desc;` +
    `limit ${GAME_LIMIT};`;

  const res = await fetch(IGDB_GAMES_URL, {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
    next: { revalidate: REVALIDATE },
  });

  if (!res.ok) {
    throw new ApiFetchError(
      "IGDB",
      res.status,
      `HTTP ${res.status}: ${res.statusText}`,
    );
  }

  const games: IgdbGame[] = await res.json();

  return games
    .filter(
      (g) =>
        typeof g.first_release_date === "number" &&
        !!g.cover?.url &&
        !!g.name,
    )
    .map<GameItem>((g) => ({
      id: g.id,
      name: g.name,
      imageUrl: normalizeCoverUrl(g.cover!.url!),
      value: g.first_release_date!,
      displayValue: new Date(g.first_release_date! * 1000)
        .toISOString()
        .slice(0, 10),
    }));
}
