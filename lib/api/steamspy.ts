/**
 * SteamSpy fetcher — Peak Concurrent Players
 *
 * Endpoint: https://steamspy.com/api.php?request=top100in2weeks
 * No API key required.
 *
 * GameItem mapping:
 *   value        = ccu (previous-day peak concurrent users)
 *   displayValue = formatted peak count, e.g. "1.23M peak players"
 *
 * `ccu` semantics (verified 2026-10-12 against SteamSpy's About page and the
 * `steamr` API reference): the **peak concurrent-user count recorded
 * yesterday** — a daily peak, NOT a live/instantaneous count and NOT an
 * all-time peak. SteamSpy pulls data every minute but updates visualizations
 * once daily (GMT+2), so the metric is at least one day stale by design.
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
  /** Previous-day peak concurrent users (CCU yesterday) — not a live count */
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

/**
 * Formats a previous-day peak concurrent-player count. The word "peak" is
 * required so the card never implies a live/instantaneous player count.
 */
function formatPlayerCount(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M peak players`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K peak players`;
  }
  return `${n.toLocaleString("en-US")} peak players`;
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
        g.ccu > 0 &&           // exclude ccu = 0 (no meaningful comparison value)
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
    .sort((a, b) => b.value - a.value); // highest previous-day peak first
}
