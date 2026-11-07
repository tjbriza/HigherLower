import { readFileSync } from "node:fs";
import { join } from "node:path";

const MB_BASE = "https://musicbrainz.org/ws/2/artist/";
const WD_ENDPOINT = "https://www.wikidata.org/w/api.php";
const MBID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;
const MB_USER_AGENT = "HigherLower/0.1 (https://github.com/higherlower)";

export type IdentityStatus = "both_agree" | "musicbrainz_only" | "wikidata_only" | "conflict" | "missing" | "ambiguous" | "invalid";
export interface MusicSpotifyIdentity {
  readonly mbid: string;
  readonly name: string;
  readonly spotifyArtistId: string | null;
  readonly spotifyUrl: string | null;
  readonly status: IdentityStatus;
  readonly approved: boolean;
  readonly imageUrl: string | null;
  readonly attribution: string | null;
}

export function spotifyArtistIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["open.spotify.com", "www.open.spotify.com"].includes(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2 || parts[0] !== "artist" || !SPOTIFY_ID_PATTERN.test(parts[1])) return null;
    return parts[1];
  } catch { return null; }
}

export function classifySpotifyIdentity(
  mbid: string,
  name: string,
  musicbrainzIds: readonly string[],
  wikidataIds: readonly string[],
): MusicSpotifyIdentity {
  const unique = (ids: readonly string[]) => [...new Set(ids)];
  const mb = unique(musicbrainzIds.filter((id) => SPOTIFY_ID_PATTERN.test(id)));
  const wd = unique(wikidataIds.filter((id) => SPOTIFY_ID_PATTERN.test(id)));
  let status: IdentityStatus;
  let id: string | null = null;
  if (!MBID_PATTERN.test(mbid)) status = "invalid";
  else if (mb.length > 1 || wd.length > 1) status = "ambiguous";
  else if (mb.length && wd.length) {
    status = mb[0] === wd[0] ? "both_agree" : "conflict";
    if (status === "both_agree") id = mb[0];
  } else if (mb.length) { status = "musicbrainz_only"; id = mb[0]; }
  else if (wd.length) { status = "wikidata_only"; id = wd[0]; }
  else status = "missing";
  return {
    mbid: mbid.toLowerCase(), name, spotifyArtistId: id,
    spotifyUrl: id ? `https://open.spotify.com/artist/${id}` : null,
    status, approved: false, imageUrl: null, attribution: null,
  };
}

async function pacedJson(url: URL, lastRequest: { at: number }, fetchImpl: typeof fetch, headers: HeadersInit = {}): Promise<unknown> {
  const delay = Math.max(0, 1100 - (Date.now() - lastRequest.at));
  if (lastRequest.at) await new Promise((resolve) => setTimeout(resolve, delay));
  lastRequest.at = Date.now();
  const response = await fetchImpl(url, { headers });
  if (!response.ok) throw new Error(`Identity source request failed with HTTP ${response.status}.`);
  return response.json();
}

async function fetchIdentity(mbid: string, name: string, fetchImpl: typeof fetch, clocks: { mb: { at: number }; wd: { at: number } }): Promise<MusicSpotifyIdentity> {
  const artistUrl = new URL(`${MB_BASE}${encodeURIComponent(mbid)}`);
  artistUrl.searchParams.set("fmt", "json");
  artistUrl.searchParams.set("inc", "url-rels");
  const mbRaw = await pacedJson(artistUrl, clocks.mb, fetchImpl, { "User-Agent": MB_USER_AGENT, Accept: "application/json" });
  const relations = mbRaw && typeof mbRaw === "object" && Array.isArray((mbRaw as { relations?: unknown }).relations)
    ? (mbRaw as { relations: unknown[] }).relations : [];
  const mbIds = relations.flatMap((relation) => {
    if (!relation || typeof relation !== "object") return [];
    const url = (relation as { url?: { resource?: unknown } }).url?.resource;
    return typeof url === "string" ? [spotifyArtistIdFromUrl(url)].filter((id): id is string => id !== null) : [];
  });
  const wdUrl = new URL(WD_ENDPOINT);
  wdUrl.searchParams.set("action", "wbsearchentities");
  wdUrl.searchParams.set("search", mbid);
  wdUrl.searchParams.set("language", "en");
  wdUrl.searchParams.set("format", "json");
  wdUrl.searchParams.set("type", "item");
  const search = await pacedJson(wdUrl, clocks.wd, fetchImpl, { Accept: "application/json" });
  const entities = search && typeof search === "object" && Array.isArray((search as { search?: unknown }).search)
    ? (search as { search: unknown[] }).search : [];
  const exactQids = entities.flatMap((entity) => entity && typeof entity === "object" &&
    (entity as { match?: { type?: unknown; text?: unknown }; id?: unknown }).match?.type === "entity-claim" &&
    (entity as { match?: { text?: unknown } }).match?.text === mbid && typeof (entity as { id?: unknown }).id === "string"
      ? [(entity as { id: string }).id] : []);
  const wdIds: string[] = [];
  for (const qid of [...new Set(exactQids)]) {
    const entityUrl = new URL(WD_ENDPOINT);
    entityUrl.searchParams.set("action", "wbgetentities");
    entityUrl.searchParams.set("ids", qid);
    entityUrl.searchParams.set("props", "claims");
    entityUrl.searchParams.set("format", "json");
    const entityData = await pacedJson(entityUrl, clocks.wd, fetchImpl, { Accept: "application/json" });
    const claims = entityData && typeof entityData === "object" ? (entityData as { entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>> }> }).entities?.[qid]?.claims : undefined;
    for (const claim of claims?.P434 ?? []) {
      if (claim.mainsnak?.datavalue?.value === mbid) {
        for (const spotify of claims?.P1902 ?? []) {
          const value = spotify.mainsnak?.datavalue?.value;
          if (typeof value === "string") wdIds.push(value);
        }
      }
    }
  }
  return classifySpotifyIdentity(mbid, name, mbIds, wdIds);
}

function discoverSnapshotArtists(): { mbid: string; name: string }[] {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "lib/api/data/artist-album-counts.snapshot.json"), "utf8")) as { items?: unknown };
  if (!Array.isArray(raw.items)) throw new Error("Artist snapshot contains no item list.");
  return raw.items.map((item) => {
    if (!item || typeof item !== "object" || typeof (item as { id?: unknown }).id !== "string" || typeof (item as { name?: unknown }).name !== "string") {
      throw new Error("Artist snapshot has a malformed identity record.");
    }
    return { mbid: (item as { id: string }).id, name: (item as { name: string }).name };
  });
}

export async function censusMusicSpotifyIdentities(options: { fetchImpl?: typeof fetch; artists?: readonly { mbid: string; name: string }[] } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const source = options.artists ?? discoverSnapshotArtists();
  const byMbid = new Map<string, { mbid: string; name: string }>();
  let invalid = 0;
  let duplicates = 0;
  for (const artist of source) {
    if (!MBID_PATTERN.test(artist.mbid)) { invalid += 1; continue; }
    const mbid = artist.mbid.toLowerCase();
    if (byMbid.has(mbid)) { duplicates += 1; continue; }
    byMbid.set(mbid, { mbid, name: artist.name.trim() });
  }
  const clocks = { mb: { at: 0 }, wd: { at: 0 } };
  const records: MusicSpotifyIdentity[] = [];
  for (const artist of [...byMbid.values()].sort((a, b) => a.mbid.localeCompare(b.mbid))) {
    const resolved = await fetchIdentity(artist.mbid, artist.name, fetchImpl, clocks);
    const image = parseArtistImageSnapshot(readFileSync(join(process.cwd(), "lib/api/data/artist-album-counts.snapshot.json"), "utf8"));
    const approvedIdentity = resolved.spotifyArtistId !== null && ["both_agree", "musicbrainz_only", "wikidata_only"].includes(resolved.status);
    records.push({ ...resolved, approved: approvedIdentity && Boolean(image.get(resolved.mbid)?.imageUrl),
      imageUrl: image.get(resolved.mbid)?.imageUrl ?? null, attribution: image.get(resolved.mbid)?.attribution ?? null });
  }
  const counts = records.reduce<Record<string, number>>((acc, record) => { acc[record.status] = (acc[record.status] ?? 0) + 1; return acc; }, {});
  return {
    records,
    report: { sourceRecords: source.length, uniqueValidMbidCount: records.length, invalidMbidCount: invalid, duplicateMbidCount: duplicates, approvedCount: records.filter((record) => record.approved).length, statusCounts: counts },
  };
}

function parseArtistImageSnapshot(text: string): Map<string, { imageUrl: string; attribution: string | null }> {
  const raw = JSON.parse(text) as { items?: unknown };
  if (!Array.isArray(raw.items)) throw new Error("Artist image source snapshot is malformed.");
  const byMbid = new Map<string, { imageUrl: string; attribution: string | null }>();
  for (const item of raw.items) {
    if (!item || typeof item !== "object") continue;
    const value = item as { id?: unknown; imageUrl?: unknown; attribution?: unknown };
    if (typeof value.id === "string" && typeof value.imageUrl === "string" && value.imageUrl.startsWith("https://")) {
      byMbid.set(value.id.toLowerCase(), { imageUrl: value.imageUrl, attribution: typeof value.attribution === "string" ? value.attribution : null });
    }
  }
  return byMbid;
}

export async function writeIdentityCatalog(census: Awaited<ReturnType<typeof censusMusicSpotifyIdentities>>, destination = join(process.cwd(), "lib/api/data/music-spotify-identities.json")) {
  const fs = await import("node:fs/promises");
  const tmp = `${destination}.${process.pid}.tmp`;
  const artifact = { version: 1, generatedAt: new Date().toISOString(), records: census.records };
  await fs.writeFile(tmp, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  const check = JSON.parse(await fs.readFile(tmp, "utf8")) as typeof artifact;
  if (check.records.length !== census.records.length || check.records.some((record) => record.spotifyArtistId === undefined)) {
    await fs.unlink(tmp).catch(() => undefined);
    throw new Error("Identity catalog failed read-back validation.");
  }
  await fs.rename(tmp, destination);
}
