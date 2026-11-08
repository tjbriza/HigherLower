/**
 * Developer-run offline Twitch avatar enrichment.
 *
 * Reads the owner-approved Twitch roster, calls Twitch Helix Get Users in
 * batches of at most 100 identities (196 approved identities => 2 requests),
 * and writes verified `profile_image_url` CDN URLs to a local artifact.
 *
 * Only URLs are stored. No binaries, no base64, no re-syndication. Identities
 * without a usable returned image are simply omitted; the runtime reader falls
 * back to the deterministic identicon for those items.
 *
 * Credentials come from TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET or a minimal
 * .env.local read. They are never printed, logged, or written.
 *
 * Usage:
 *   node scripts/enrich-twitch-profile-images.mjs
 */

import { readFileSync } from "node:fs";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SCRIPT_DIR, "..");
const ROSTER_PATH = join(PROJECT_ROOT, "lib", "api", "data", "twitch-owner-review-roster.json");
const OUTPUT_PATH = join(PROJECT_ROOT, "lib", "api", "data", "twitch-avatar-images.json");
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const USERS_URL = "https://api.twitch.tv/helix/users";
const SOURCE = "Twitch Helix Get Users; ownerApproved roster only";
const REQUEST_CAP = 100;
const AVATAR_HOSTNAME = "static-cdn.jtvnw.net";
const SOURCE_ORIGIN = "helix-discovery-review-seed";
const LOGIN_PATTERN = /^[a-z0-9_]{1,25}$/;
const TOP_LEVEL_KEYS = [
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
const ENTRY_KEYS = ["userId", "login", "displayName", "profileImageUrl", "verifiedAt"];
// Anything credential-shaped in the serialized artifact aborts the write.
const SENSITIVE_PATTERN = /client_secret|clientSecret|access_token|accessToken|Bearer\s|TWITCH_CLIENT_SECRET|TWITCH_CLIENT_ID/i;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record, allowed) {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function validateRoster(raw) {
  if (!isRecord(raw) || raw.version !== 1 || raw.sourceOrigin !== SOURCE_ORIGIN || !Array.isArray(raw.items)) {
    throw new Error("Owner review roster schema or provenance is invalid.");
  }
  const ids = new Set();
  const logins = new Set();
  for (const item of raw.items) {
    if (!isRecord(item) || typeof item.login !== "string" ||
      item.login !== item.login.toLowerCase() || !LOGIN_PATTERN.test(item.login) ||
      item.id !== `twitch:${item.login}` || ids.has(item.id) || logins.has(item.login) ||
      typeof item.displayLabel !== "string" || !item.displayLabel.trim() ||
      item.sourceOrigin !== SOURCE_ORIGIN ||
      !["pendingReview", "ownerApproved", "rejected"].includes(item.status) ||
      !hasOnlyKeys(item, ["id", "login", "displayLabel", "sourceOrigin", "status"])) {
      throw new Error("Owner review roster item failed validation.");
    }
    ids.add(item.id);
    logins.add(item.login);
  }
  return raw.items;
}

function isVerifiedAvatarUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === AVATAR_HOSTNAME;
  } catch {
    return false;
  }
}

// Minimal .env.local read, following the precedent in
// scripts/generate-youtube-channel-catalog.mjs. Only the two named settings are
// read; the file contents and any value are never echoed.
function readEnvLocal(names) {
  const found = {};
  let envText;
  try {
    envText = readFileSync(join(PROJECT_ROOT, ".env.local"), "utf8");
  } catch {
    return found;
  }
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !names.includes(match[1])) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2").trim();
    if (value) found[match[1]] = value;
  }
  return found;
}

function getCredentials() {
  const envClientId = (process.env.TWITCH_CLIENT_ID ?? "").trim();
  const envClientSecret = (process.env.TWITCH_CLIENT_SECRET ?? "").trim();
  if (envClientId && envClientSecret) return { clientId: envClientId, clientSecret: envClientSecret };

  const fromFile = readEnvLocal(["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"]);
  return {
    clientId: envClientId || fromFile.TWITCH_CLIENT_ID || "",
    clientSecret: envClientSecret || fromFile.TWITCH_CLIENT_SECRET || "",
  };
}

let tokenCache = null;

async function getAccessToken(clientId, clientSecret) {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  });

  let response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new Error("Token request failed before receiving a response.");
  }
  if (response.status !== 200) throw new Error(`Token request failed with HTTP ${response.status}.`);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Token response was not valid JSON.");
  }
  if (!isRecord(payload) || typeof payload.access_token !== "string" || !payload.access_token ||
    typeof payload.token_type !== "string" || payload.token_type.toLowerCase() !== "bearer") {
    throw new Error("Token response was malformed.");
  }

  const expiresIn = typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
    ? payload.expires_in
    : 3600;
  tokenCache = {
    token: payload.access_token,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
  };
  return tokenCache.token;
}

async function fetchUsers(logins, token, clientId) {
  const url = new URL(USERS_URL);
  for (const login of logins) url.searchParams.append("login", login);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
  } catch {
    throw new Error("Helix users request failed before receiving a response.");
  }
  // Do not print the request URL, headers, or response body.
  if (response.status !== 200) throw new Error(`Helix users request failed with HTTP ${response.status}.`);

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Helix users response was not valid JSON.");
  }
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw new Error("Helix users response shape was invalid.");
  return payload.data;
}

function selfValidate(artifact) {
  if (!isRecord(artifact) || artifact.schemaVersion !== 1 ||
    !hasOnlyKeys(artifact, TOP_LEVEL_KEYS) ||
    Object.keys(artifact).length !== TOP_LEVEL_KEYS.length) {
    throw new Error("Read-back artifact schema mismatched the expected shape.");
  }
  if (artifact.requestCap !== REQUEST_CAP) throw new Error("Read-back requestCap mismatched.");
  if (artifact.batchCount !== Math.ceil(artifact.requestedIdentities / REQUEST_CAP)) {
    throw new Error("Read-back batchCount mismatched.");
  }
  if (!isRecord(artifact.entries)) throw new Error("Read-back entries were not an object.");
  const logins = Object.keys(artifact.entries);
  if (artifact.returnedIdentities !== logins.length) throw new Error("Read-back returnedIdentities mismatched.");
  const sorted = [...logins].sort();
  if (logins.some((login, index) => login !== sorted[index])) throw new Error("Read-back entries were not sorted by login.");
  for (const login of logins) {
    const entry = artifact.entries[login];
    if (!isRecord(entry) || !hasOnlyKeys(entry, ENTRY_KEYS) ||
      Object.keys(entry).length !== ENTRY_KEYS.length ||
      entry.login !== login || !LOGIN_PATTERN.test(login) ||
      typeof entry.userId !== "string" || !/^\d+$/.test(entry.userId) ||
      typeof entry.displayName !== "string" || !entry.displayName.trim() ||
      typeof entry.verifiedAt !== "string" || !Number.isFinite(Date.parse(entry.verifiedAt)) ||
      !isVerifiedAvatarUrl(entry.profileImageUrl)) {
      throw new Error("Read-back entry failed validation.");
    }
  }
}

async function main() {
  const rosterInput = JSON.parse(await readFile(ROSTER_PATH, "utf8"));
  const approved = validateRoster(rosterInput).filter((item) => item.status === "ownerApproved");
  if (!approved.length) throw new Error("Owner-approved roster set is empty.");

  const { clientId, clientSecret } = getCredentials();
  if (!clientId || !clientSecret) {
    console.log("Twitch app credentials unavailable");
    process.exitCode = 1;
    return;
  }

  const batches = [];
  for (let index = 0; index < approved.length; index += REQUEST_CAP) {
    batches.push(approved.slice(index, index + REQUEST_CAP));
  }

  const token = await getAccessToken(clientId, clientSecret);
  const entries = {};
  const seenUserIds = new Map();

  for (const batch of batches) {
    const verifiedAt = new Date().toISOString();
    const returned = await fetchUsers(batch.map((item) => item.login), token, clientId);
    const requested = new Map(batch.map((item) => [item.login, item]));

    for (const user of returned) {
      if (!isRecord(user)) throw new Error("Helix user record was not an object.");
      const login = typeof user.login === "string" ? user.login.toLowerCase() : "";
      const userId = typeof user.id === "string" ? user.id : "";
      if (!LOGIN_PATTERN.test(login) || !/^\d+$/.test(userId)) {
        throw new Error("Helix user record carried an invalid identity.");
      }
      const rosterItem = requested.get(login);
      if (!rosterItem) continue; // unrequested user
      const previousUserId = seenUserIds.get(login);
      if (previousUserId && previousUserId !== userId) {
        throw new Error("Helix returned the same login with differing user IDs.");
      }
      seenUserIds.set(login, userId);
      const profileImageUrl = user.profile_image_url;
      if (!isVerifiedAvatarUrl(profileImageUrl)) continue; // omit this identity; identicon fallback applies
      const displayName = typeof user.display_name === "string" && user.display_name.trim()
        ? user.display_name
        : rosterItem.displayLabel;
      entries[login] = { userId, login, displayName, profileImageUrl, verifiedAt };
    }
  }

  const sortedLogins = Object.keys(entries).sort();
  const sortedEntries = {};
  for (const login of sortedLogins) sortedEntries[login] = entries[login];

  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: SOURCE,
    endpoint: USERS_URL,
    requestCap: REQUEST_CAP,
    batchCount: batches.length,
    requestedIdentities: approved.length,
    returnedIdentities: sortedLogins.length,
    entries: sortedEntries,
  };

  if (artifact.returnedIdentities === 0) {
    throw new Error("No verified profile images were returned; nothing was written.");
  }

  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (SENSITIVE_PATTERN.test(serialized)) {
    throw new Error("Serialized artifact matched a credential pattern; nothing was written.");
  }

  const tempPath = `${OUTPUT_PATH}.${process.pid}.tmp`;
  try {
    await writeFile(tempPath, serialized, "utf8");
    const reread = JSON.parse(await readFile(tempPath, "utf8"));
    selfValidate(reread);
    await rename(tempPath, OUTPUT_PATH);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }

  console.log(JSON.stringify({
    approvedIdentities: approved.length,
    batchCount: batches.length,
    requestedIdentities: approved.length,
    returnedIdentities: sortedLogins.length,
    entries: sortedLogins.length,
    omitted: approved.length - sortedLogins.length,
  }));
}

main().catch((error) => {
  console.error(`[twitch-avatars] ERROR: ${error instanceof Error ? error.message : "unknown failure"}`);
  process.exitCode = 1;
});
