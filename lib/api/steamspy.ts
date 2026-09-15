/**
 * SteamSpy fetcher — Game Playerbase
 *
 * Endpoint: https://steamspy.com/api.php?request=top100in2weeks
 * No API key required.
 *
 * GameItem mapping:
 *   value        = ccu (concurrent users — peak at time of request)
 *   displayValue = formatted player count, e.g. "1,234,567 players"
 *
 * SteamSpy does not serve cover art directly; we supplement with the
 * Steam CDN which uses the same appid.
 */

import { GameItem, ApiFetchError } from "@/types/api";

// ─── Raw API types ────────────────────────────────────────────────────────────

/**
 * SteamSpy returns a map of appid → game data object.
 * Only the fields we use are typed here.
 */
interface SteamSpyGame {
  appid: number;
  name: string;
  /** Current concurrent users (peak CCU in last 2 weeks) */
  ccu: number;
  /** Owners range string, e.g. "50,000,000 .. 100,000,000" — not used for value */
  owners: string;
}

type SteamSpyResponse = Record<string, SteamSpyGame>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STEAM_CDN = "https://cdn.akamai.steamstatic.com/steam/apps";
const STEAMSPY_URL = "https://steamspy.com/api.php?request=top100in2weeks";

/**
 * Steam CDN paths for game images.
 * library_600x900.jpg = portrait cover art (600×900 px) — high quality, always available
 * for titles on the Steam store. Falls back to header.jpg if needed.
 */
function steamImageUrl(appid: number): string {
  return `${STEAM_CDN}/${appid}/library_600x900.jpg`;
}

/** Formats a number as a localised string with a "players" suffix */
function formatPlayerCount(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M players`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K players`;
  }
  return `${n.toLocaleString("en-US")} players`;
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export async function fetchGamePlayerbase(): Promise<GameItem[]> {
  const res = await fetch(
    STEAMSPY_URL,
    // SteamSpy data refreshes regularly; revalidate every hour
    { next: { revalidate: 60 * 60 } },
  );

  if (!res.ok) {
    throw new ApiFetchError(
      "SteamSpy",
      res.status,
      `HTTP ${res.status}: ${res.statusText}`,
    );
  }

  const data: SteamSpyResponse = await res.json();

  const games = Object.values(data);

  return games
    .filter(
      (g) =>
        g.ccu > 0 &&           // skip games with zero concurrent users
        g.name?.trim() &&      // must have a name
        g.name.length <= 60 && // skip very long DLC/bundle titles
        g.appid,               // must have a Steam App ID for the CDN image
    )
    .map<GameItem>((g) => ({
      id: g.appid,
      name: g.name,
      imageUrl: steamImageUrl(g.appid),
      value: g.ccu,
      displayValue: formatPlayerCount(g.ccu),
    }))
    .sort((a, b) => b.value - a.value); // highest CCU first
}
