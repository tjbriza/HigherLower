/**
 * SteamSpy fetcher — Game Ratings (Steam Review Score %)
 *
 * Endpoint: https://steamspy.com/api.php?request=top100forever
 * No API key required.
 *
 * The "top 100 all-time" by total owners gives us well-known games with
 * meaningful review counts. We derive a % score from:
 *   score = Math.round(positive / (positive + negative) * 100)
 *
 * GameItem mapping:
 *   id           = appid
 *   name         = name
 *   imageUrl     = Steam CDN header image (cdn.akamai.steamstatic.com)
 *   value        = review score 0–100
 *   displayValue = "${score}% positive"
 */

import { GameItem, ApiFetchError } from "@/types/api";

// ─── Raw API types ────────────────────────────────────────────────────────────

interface SteamSpyGame {
  appid: number;
  name: string;
  /** Total positive reviews across all time */
  positive: number;
  /** Total negative reviews across all time */
  negative: number;
  ccu: number;
}

type SteamSpyResponse = Record<string, SteamSpyGame>;

// ─── Constants ────────────────────────────────────────────────────────────────

const STEAMSPY_URL = "https://steamspy.com/api.php?request=top100forever";
const STEAM_CDN = "https://cdn.akamai.steamstatic.com/steam/apps";

function steamImageUrl(appid: number): string {
  return `${STEAM_CDN}/${appid}/library_600x900.jpg`;
}

/** Min total reviews to trust the score (avoids 1 positive = 100%) */
const MIN_REVIEWS = 500;

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export async function fetchGameRatings(): Promise<GameItem[]> {
  const res = await fetch(STEAMSPY_URL, {
    // All-time data changes slowly — cache for 12 hours
    next: { revalidate: 60 * 60 * 12 },
  });

  if (!res.ok) {
    throw new ApiFetchError(
      "SteamSpy (game-ratings)",
      res.status,
      `HTTP ${res.status}: ${res.statusText}`,
    );
  }

  const data: SteamSpyResponse = await res.json();
  const games = Object.values(data);

  return games
    .filter((g) => {
      if (!g.appid || !g.name?.trim()) return false;
      if (g.name.length > 60) return false;     // drop DLC/bundles
      const total = g.positive + g.negative;
      if (total < MIN_REVIEWS) return false;
      return true;
    })
    .map<GameItem>((g) => {
      const total = g.positive + g.negative;
      const score = Math.round((g.positive / total) * 100);
      return {
        id: g.appid,
        name: g.name,
        imageUrl: steamImageUrl(g.appid),
        value: score,
        displayValue: `${score}% positive`,
      };
    })
    .sort((a, b) => b.value - a.value); // highest rated first before shuffle
}
