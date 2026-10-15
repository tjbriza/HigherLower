/**
 * YouTube Data API fetcher — Subscribers
 *
 * Endpoint: https://www.googleapis.com/youtube/v3/channels
 * Requires:  YOUTUBE_API_KEY  (server-only env var, no NEXT_PUBLIC_ prefix)
 *
 * Fetcher:
 *   fetchYouTubeSubscribers() → provider key "youtube-subscribers"
 *
 * Reads generated channel identities. Discovery is developer-run only; normal
 * runtime calls channels.list for fresh title, subscriber values, and images.
 * Channel IDs are batched within the documented per-request ID limit.
 *
 * Quota (verified): `channels.list` costs 1 unit per call; default daily quota
 * is 10,000 units. With a curated pool and long revalidate, usage is
 * negligible. `quotaExceeded` (HTTP 403) surfaces as an error, never a silent
 * empty pool.
 *
 * GameItem mapping:
 *   value        = parseInt(subscriberCount, 10)
 *   displayValue = localized count, e.g. "112,000,000 subscribers"
 */

import { GameItem, ApiFetchError } from "@/types/api";
import {
  MIN_YOUTUBE_CATALOG_ITEMS,
  readYoutubeChannelCatalog,
} from "./youtubeChannelCatalog";

// ─── Raw API types ────────────────────────────────────────────────────────────

interface YouTubeChannel {
  id: string;
  snippet?: {
    title?: string;
    thumbnails?: {
      high?: { url?: string };
      default?: { url?: string };
      medium?: { url?: string };
    };
  };
  statistics?: {
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
  };
}

interface YouTubeChannelsResponse {
  items?: YouTubeChannel[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const YT_BASE = "https://www.googleapis.com/youtube/v3/channels";
/** Documented per-request ID limit for `channels.list`. */
const ID_BATCH_SIZE = 50;
/** Subscriber counts change; cache for 6 hours. */
const REVALIDATE = 60 * 60 * 6;

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export async function fetchYouTubeSubscribers(): Promise<GameItem[]> {
  // Validate catalog before requiring the provider credential so catalog
  // corruption/missing generation fails explicitly and never falls back to seeds.
  const channelIds = readYoutubeChannelCatalog().items.map((item) => item.channelId);
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new ApiFetchError(
      "YouTube",
      null,
      "YOUTUBE_API_KEY is not set. Add it to your .env.local file.",
    );
  }

  const requestedIds = new Set(channelIds);

  const items: GameItem[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < channelIds.length; i += ID_BATCH_SIZE) {
    const batch = channelIds.slice(i, i + ID_BATCH_SIZE);
    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: batch.join(","),
      key: apiKey,
    });
    const url = `${YT_BASE}?${params.toString()}`;

    let res: Response;
    try {
      res = await fetch(url, { next: { revalidate: REVALIDATE } });
    } catch {
      throw new ApiFetchError("YouTube", null, "Provider request failed before receiving a response.");
    }

    if (!res.ok) {
      throw new ApiFetchError(
        "YouTube",
        res.status,
        `HTTP ${res.status}: ${res.statusText}`,
      );
    }

    let data: YouTubeChannelsResponse;
    try {
      data = (await res.json()) as YouTubeChannelsResponse;
    } catch {
      throw new ApiFetchError("YouTube", res.status, "Provider returned an invalid JSON response.");
    }

    for (const channel of data.items ?? []) {
      if (!requestedIds.has(channel.id) || seen.has(channel.id)) continue;

      const stats = channel.statistics;
      // Drop channels with hidden or absent subscriber counts.
      if (!stats || stats.hiddenSubscriberCount === true) continue;
      if (!stats.subscriberCount || !/^\d+$/.test(stats.subscriberCount)) continue;

      const value = Number(stats.subscriberCount);
      if (!Number.isSafeInteger(value)) continue;

      const title = channel.snippet?.title?.trim();
      if (!title) continue;

      const thumb = [
        channel.snippet?.thumbnails?.high?.url,
        channel.snippet?.thumbnails?.medium?.url,
        channel.snippet?.thumbnails?.default?.url,
      ].find((candidate) => {
        if (!candidate) return false;
        try {
          return new URL(candidate).protocol === "https:";
        } catch {
          return false;
        }
      });
      if (!thumb) continue;

      seen.add(channel.id);
      items.push({
        id: channel.id,
        name: title,
        imageUrl: thumb,
        value,
        displayValue: `${value.toLocaleString("en-US")} subscribers`,
      });
    }
  }

  if (items.length < MIN_YOUTUBE_CATALOG_ITEMS) {
    throw new ApiFetchError(
      "YouTube",
      null,
      `Only ${items.length} catalog channels returned usable live data; ` +
        `the YouTube catalog integrity minimum is ${MIN_YOUTUBE_CATALOG_ITEMS}.`,
    );
  }

  return items;
}
