import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "lib/api/data/twitch-stream-candidates.json");
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;
const MAX_ROWS = PAGE_LIMIT * MAX_PAGES;

function getCredentials() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Twitch app credentials unavailable");
  return { clientId, clientSecret };
}

async function getAppToken(clientId, clientSecret) {
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
  });
  if (!response.ok) throw new Error(`Twitch app authorization failed: HTTP ${response.status}`);
  const token = await response.json();
  if (typeof token.access_token !== "string" || !token.access_token) throw new Error("Twitch app authorization response invalid");
  return token.access_token;
}

async function getStreams(clientId, token, cursor) {
  const url = new URL("https://api.twitch.tv/helix/streams");
  url.searchParams.set("first", String(PAGE_LIMIT));
  if (cursor) url.searchParams.set("after", cursor);
  const response = await fetch(url, {
    headers: { "Client-Id": clientId, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Get Streams failed: HTTP ${response.status}`);
  return response.json();
}

function numericId(value) {
  return typeof value === "string" && /^[0-9]+$/.test(value);
}

function normalize(stream, rank) {
  return {
    userId: stream.user_id,
    login: stream.user_login,
    displayName: stream.user_name,
    language: stream.language || null,
    viewerCount: stream.viewer_count,
    rank,
    sourceStartedAt: stream.started_at,
    profileImageUrl: null,
    classification: "hold",
    provenance: "Twitch Helix Get Streams; viewer-prominence rank observed in bounded discovery pagination",
    qualification: "pending identity review; Get Users and human qualification not performed",
  };
}

async function main() {
  const { clientId, clientSecret } = getCredentials();
  const token = await getAppToken(clientId, clientSecret);
  let cursor;
  let pages = 0;
  let rawRows = 0;
  const deduped = new Map();
  const pageCounts = [];

  try {
    while (pages < MAX_PAGES && rawRows < MAX_ROWS) {
      const result = await getStreams(clientId, token, cursor);
      const rows = Array.isArray(result.data) ? result.data : [];
      if (rows.length > PAGE_LIMIT || rawRows + rows.length > MAX_ROWS) throw new Error("Twitch response exceeded hard row bound");
      pages += 1;
      const pageStartRank = rawRows + 1;
      pageCounts.push(rows.length);
      for (let index = 0; index < rows.length; index += 1) {
        const stream = rows[index];
        rawRows += 1;
        if (!numericId(stream.user_id) || !Number.isFinite(stream.viewer_count) || typeof stream.user_login !== "string" || typeof stream.user_name !== "string") continue;
        const candidate = normalize(stream, pageStartRank + index);
        const previous = deduped.get(candidate.userId);
        if (!previous || candidate.viewerCount > previous.viewerCount) deduped.set(candidate.userId, candidate);
      }
      const next = result.pagination?.cursor;
      if (!next || rows.length === 0) break;
      cursor = next;
    }
  } finally {
    // Avoid retaining the bearer token after the bounded collection run.
    void token;
  }

  const candidates = [...deduped.values()].sort((a, b) => a.rank - b.rank);
  const artifact = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "Twitch Helix Get Streams",
    production: false,
    requestSummary: { pages, pageSize: PAGE_LIMIT, rawRows, pageCounts, maxPages: MAX_PAGES, maxRawRows: MAX_ROWS },
    ranking: "Observed stream viewer prominence; rank is first observed page position. Duplicate IDs retain highest observed viewer count and that observation's rank.",
    candidates,
  };
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: "lib/api/data/twitch-stream-candidates.json", pages, rawRows, uniqueNumericUserIds: candidates.length, pageCounts }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Twitch discovery failed");
  process.exitCode = 1;
});
