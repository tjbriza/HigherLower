/**
 * Server-side reader for the generated YouTube channel identity catalog.
 * The catalog contains public IDs and review-only titles; subscriber values
 * are always fetched live by `youtube.ts`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ApiFetchError } from "@/types/api";

export interface YoutubeChannelIdentity {
  readonly channelId: string;
  readonly title: string;
}

export interface YoutubeChannelCatalog {
  readonly version: 1;
  readonly generatedAt: string;
  readonly source: string;
  readonly items: readonly YoutubeChannelIdentity[];
}

export const YOUTUBE_CHANNEL_CATALOG_VERSION = 1;
/**
 * The approved 50-item production-readiness minimum applies to generated
 * catalog integrity, not to the dispatcher's general playable-pool floor.
 */
export const MIN_YOUTUBE_CATALOG_ITEMS = 50;

const CATALOG_RELATIVE_PATH = "lib/api/data/youtube-channel-catalog.json";
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return Object.keys(value).every((key) => expected.includes(key));
}

export function isValidYoutubeChannelId(value: unknown): value is string {
  return typeof value === "string" && CHANNEL_ID_PATTERN.test(value);
}

export function parseYoutubeChannelCatalog(
  raw: unknown,
): YoutubeChannelCatalog {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ["version", "generatedAt", "source", "items"])) {
    throw new ApiFetchError(
      "YouTubeChannelCatalog",
      null,
      "Catalog is not an identity-only JSON object.",
    );
  }

  if (raw.version !== YOUTUBE_CHANNEL_CATALOG_VERSION) {
    throw new ApiFetchError(
      "YouTubeChannelCatalog",
      null,
      `Unsupported catalog version: ${String(raw.version)}.`,
    );
  }

  if (
    typeof raw.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(raw.generatedAt)) ||
    typeof raw.source !== "string" ||
    raw.source.trim().length === 0
  ) {
    throw new ApiFetchError(
      "YouTubeChannelCatalog",
      null,
      "Catalog metadata is missing or invalid.",
    );
  }

  if (!Array.isArray(raw.items)) {
    throw new ApiFetchError(
      "YouTubeChannelCatalog",
      null,
      "Catalog items is not an array.",
    );
  }

  const items: YoutubeChannelIdentity[] = [];
  const ids = new Set<string>();
  let previousId = "";

  for (const candidate of raw.items) {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, ["channelId", "title"]) ||
      !isValidYoutubeChannelId(candidate.channelId) ||
      typeof candidate.title !== "string" ||
      candidate.title.trim().length === 0
    ) {
      throw new ApiFetchError(
        "YouTubeChannelCatalog",
        null,
        "Catalog contains an invalid identity record.",
      );
    }

    if (ids.has(candidate.channelId)) {
      throw new ApiFetchError(
        "YouTubeChannelCatalog",
        null,
        "Catalog contains duplicate channel IDs.",
      );
    }
    if (previousId && candidate.channelId < previousId) {
      throw new ApiFetchError(
        "YouTubeChannelCatalog",
        null,
        "Catalog identities are not in deterministic channel-ID order.",
      );
    }

    ids.add(candidate.channelId);
    previousId = candidate.channelId;
    items.push({
      channelId: candidate.channelId,
      title: candidate.title.trim(),
    });
  }

  if (items.length < MIN_YOUTUBE_CATALOG_ITEMS) {
    throw new ApiFetchError(
      "YouTubeChannelCatalog",
      null,
      `Catalog contains fewer than ${MIN_YOUTUBE_CATALOG_ITEMS} validated identities.`,
    );
  }

  return {
    version: YOUTUBE_CHANNEL_CATALOG_VERSION,
    generatedAt: raw.generatedAt,
    source: raw.source.trim(),
    items,
  };
}

export function readYoutubeChannelCatalog(): YoutubeChannelCatalog {
  const path = join(process.cwd(), CATALOG_RELATIVE_PATH);
  let text: string;

  try {
    text = readFileSync(path, "utf-8");
  } catch {
    throw new ApiFetchError(
      "YouTubeChannelCatalog",
      null,
      `Catalog file is missing at ${CATALOG_RELATIVE_PATH}. ` +
        "Run `npm run catalog:youtube-channels` to generate it.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiFetchError(
      "YouTubeChannelCatalog",
      null,
      "Catalog file is not valid JSON.",
    );
  }

  return parseYoutubeChannelCatalog(parsed);
}
