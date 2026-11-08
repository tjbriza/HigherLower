import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ApiFetchError, GameItem } from "@/types/api";

const METRICS_PATH = "lib/api/data/twitch-followers-metrika.snapshot.json";
const ROSTER_PATH = "lib/api/data/twitch-owner-review-roster.json";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/;
const AVATAR_PATH = "lib/api/data/twitch-avatar-images.json";
const AVATAR_PALETTE = ["#17152e", "#6d42d8", "#ff4f9a", "#20d9c2", "#ffd166"] as const;

function escapeXmlText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

function initialsFromDisplayName(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0]}${words[1][0]}`.toLocaleUpperCase();
  return Array.from(words[0] ?? "?").slice(0, 2).join("").toLocaleUpperCase();
}

export function createTwitchAvatarDataUri(login: string, displayName: string): string {
  let hash = 2166136261;
  for (const character of login) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const cells: string[] = [];
  for (let index = 0; index < 32; index += 1) {
    const mixed = Math.imul(hash ^ (index + 1), 0x45d9f3b);
    if ((mixed >>> 0) % 5 < 3) {
      const x = 16 + (index % 8) * 28;
      const y = 16 + Math.floor(index / 8) * 28;
      const color = AVATAR_PALETTE[(mixed >>> 16) % AVATAR_PALETTE.length];
      const size = 8 + ((mixed >>> 8) % 17);
      cells.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${color}"/>`);
    }
  }
  const initials = escapeXmlText(initialsFromDisplayName(displayName));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#10101b"/><g opacity=".92">${cells.join("")}</g><path d="M0 104h256v48H0z" fill="#10101b" fill-opacity=".82"/><text x="128" y="144" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="64" font-weight="700" fill="#fff">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

type MetricRecord = {
  id: string;
  login: string;
  followerCount: number;
  collectedAt: string;
};

type ReviewItem = {
  id: string;
  login: string;
  displayLabel: string;
  sourceOrigin: "helix-discovery-review-seed";
  status: "pendingReview" | "ownerApproved" | "rejected";
};

type RuntimeSnapshot = {
  version: 1;
  source: string;
  generatedAt: string;
  collectedAt: string;
  items: GameItem[];
};

type AvatarEntry = {
  userId: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
  verifiedAt: string;
};

const AVATAR_REQUEST_CAP = 100;
const AVATAR_TOP_LEVEL_KEYS = [
  "schemaVersion",
  "generatedAt",
  "source",
  "endpoint",
  "requestCap",
  "batchCount",
  "requestedIdentities",
  "returnedIdentities",
  "entries",
];
const AVATAR_ENTRY_KEYS = ["userId", "login", "displayName", "profileImageUrl", "verifiedAt"];

function fail(message: string): never {
  throw new ApiFetchError("TwitchFollowersSnapshot", null, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseMetrics(raw: unknown, now: number): { source: string; generatedAt: string; collectedAt: string; records: MetricRecord[] } {
  if (!isRecord(raw) || raw.version !== 1 || typeof raw.source !== "string" ||
    typeof raw.generatedAt !== "string" || typeof raw.collectedAt !== "string" ||
    !Number.isFinite(Date.parse(raw.collectedAt)) || !Array.isArray(raw.records)) {
    return fail("Metrika snapshot schema is invalid.");
  }
  const generatedAt = Date.parse(raw.generatedAt);
  if (!Number.isFinite(generatedAt) || generatedAt > now || now - generatedAt > MAX_AGE_MS) {
    return fail("Metrika snapshot is beyond its 14-day hard-stale limit.");
  }
  const logins = new Set<string>();
  const ids = new Set<string>();
  const records: MetricRecord[] = [];
  for (const candidate of raw.records) {
    if (!isRecord(candidate) || typeof candidate.login !== "string" ||
      candidate.login !== candidate.login.toLowerCase() || !LOGIN_PATTERN.test(candidate.login) ||
      candidate.id !== `twitch:${candidate.login}` || ids.has(candidate.id) || logins.has(candidate.login) ||
      typeof candidate.followerCount !== "number" || !Number.isFinite(candidate.followerCount) ||
      candidate.followerCount < 0 || !Number.isSafeInteger(candidate.followerCount) ||
      typeof candidate.collectedAt !== "string" || !Number.isFinite(Date.parse(candidate.collectedAt)) ||
      Object.keys(candidate).some((key) => !["id", "login", "followerCount", "collectedAt"].includes(key))) {
      return fail("Metrika record failed validation.");
    }
    ids.add(candidate.id);
    logins.add(candidate.login);
    records.push(candidate as MetricRecord);
  }
  return { source: raw.source, generatedAt: raw.generatedAt, collectedAt: raw.collectedAt, records };
}

function parseRoster(raw: unknown): ReviewItem[] {
  if (!isRecord(raw) || raw.version !== 1 || raw.sourceOrigin !== "helix-discovery-review-seed" ||
    !Array.isArray(raw.items)) return fail("Owner review roster schema or provenance is invalid.");
  const ids = new Set<string>();
  const logins = new Set<string>();
  const items: ReviewItem[] = [];
  for (const candidate of raw.items) {
    if (!isRecord(candidate) || typeof candidate.login !== "string" ||
      candidate.login !== candidate.login.toLowerCase() || !LOGIN_PATTERN.test(candidate.login) ||
      candidate.id !== `twitch:${candidate.login}` || ids.has(candidate.id) || logins.has(candidate.login) ||
      typeof candidate.displayLabel !== "string" || !candidate.displayLabel.trim() ||
      candidate.sourceOrigin !== "helix-discovery-review-seed" ||
      !["pendingReview", "ownerApproved", "rejected"].includes(String(candidate.status)) ||
      Object.keys(candidate).some((key) => !["id", "login", "displayLabel", "sourceOrigin", "status"].includes(key))) {
      return fail("Owner review roster item failed validation.");
    }
    ids.add(candidate.id);
    logins.add(candidate.login);
    items.push(candidate as ReviewItem);
  }
  return items;
}

function isVerifiedAvatarUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "static-cdn.jtvnw.net";
  } catch {
    return false;
  }
}

function parseAvatarImages(raw: unknown): Map<string, string> {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !isRecord(raw.entries) ||
    Object.keys(raw).some((key) => !AVATAR_TOP_LEVEL_KEYS.includes(key)) ||
    raw.requestCap !== AVATAR_REQUEST_CAP ||
    typeof raw.requestedIdentities !== "number" ||
    !Number.isSafeInteger(raw.requestedIdentities) || raw.requestedIdentities < 0 ||
    raw.batchCount !== Math.ceil(raw.requestedIdentities / AVATAR_REQUEST_CAP) ||
    raw.returnedIdentities !== Object.keys(raw.entries).length) {
    return fail("Twitch avatar artifact schema is invalid.");
  }
  const avatars = new Map<string, string>();
  for (const [key, candidate] of Object.entries(raw.entries)) {
    if (!LOGIN_PATTERN.test(key) || !isRecord(candidate) || candidate.login !== key ||
      Object.keys(candidate).some((field) => !AVATAR_ENTRY_KEYS.includes(field)) ||
      typeof candidate.userId !== "string" || !/^\d+$/.test(candidate.userId) ||
      typeof candidate.displayName !== "string" || !candidate.displayName.trim() ||
      typeof candidate.verifiedAt !== "string" || !Number.isFinite(Date.parse(candidate.verifiedAt))) {
      // Skip only this entry; the identity keeps its deterministic identicon.
      continue;
    }
    if (!isVerifiedAvatarUrl(candidate.profileImageUrl)) continue;
    const avatarEntry = candidate as unknown as AvatarEntry;
    avatars.set(key, avatarEntry.profileImageUrl);
  }
  return avatars;
}

function readAvatarImages(): Map<string, string> {
  try {
    return parseAvatarImages(JSON.parse(readFileSync(join(process.cwd(), AVATAR_PATH), "utf8")) as unknown);
  } catch (error) {
    const code = isRecord(error) ? error.code : undefined;
    const failure = code === "ENOENT"
      ? "missing-file"
      : error instanceof ApiFetchError ? "invalid-schema" : "unreadable-or-malformed";
    console.warn(`Twitch avatar artifact not used at ${AVATAR_PATH} (${failure}).`);
    return new Map<string, string>();
  }
}

function avatarImagesFrom(raw: unknown): Map<string, string> {
  if (raw === undefined) return new Map<string, string>();
  if (raw instanceof Map) return raw as Map<string, string>;
  return parseAvatarImages(raw);
}

export function buildTwitchFollowersSnapshot(
  metricsRaw: unknown,
  rosterRaw: unknown,
  avatarsRaw: unknown = undefined,
  now = Date.now(),
): RuntimeSnapshot {
  const metrics = parseMetrics(metricsRaw, now);
  const roster = parseRoster(rosterRaw);
  const avatarsByLogin = avatarImagesFrom(avatarsRaw);
  const metricsByLogin = new Map(metrics.records.map((record) => [record.login, record]));
  const approvedLogins = new Set<string>();
  const approvedIds = new Set<string>();
  const items: GameItem[] = [];
  for (const candidate of roster) {
    if (candidate.status !== "ownerApproved") continue;
    const login = candidate.login;
    const metric = metricsByLogin.get(login);
    if (!metric || metric.id !== candidate.id || approvedLogins.has(login) || approvedIds.has(candidate.id)) continue;
    approvedLogins.add(login);
    approvedIds.add(candidate.id);
    const avatarUrl = avatarsByLogin.get(login);
    items.push({
      id: candidate.id,
      name: candidate.displayLabel,
      imageUrl: avatarUrl ?? createTwitchAvatarDataUri(login, candidate.displayLabel),
      value: metric.followerCount,
      displayValue: `${metric.followerCount.toLocaleString("en-US")} followers`,
    });
  }
  return { version: 1, source: metrics.source, generatedAt: metrics.generatedAt, collectedAt: metrics.collectedAt, items };
}

export function readTwitchFollowersSnapshot(): RuntimeSnapshot {
  let metricsRaw: unknown;
  let rosterRaw: unknown;
  try {
    metricsRaw = JSON.parse(readFileSync(join(process.cwd(), METRICS_PATH), "utf8")) as unknown;
  } catch {
    return fail(`Required local data is missing or invalid at ${METRICS_PATH}.`);
  }
  try {
    rosterRaw = JSON.parse(readFileSync(join(process.cwd(), ROSTER_PATH), "utf8")) as unknown;
  } catch {
    return fail(`Required local data is missing or invalid at ${ROSTER_PATH}.`);
  }
  return buildTwitchFollowersSnapshot(metricsRaw, rosterRaw, readAvatarImages());
}

export async function fetchTwitchFollowersFromSnapshot(): Promise<GameItem[]> {
  return [...readTwitchFollowersSnapshot().items];
}
