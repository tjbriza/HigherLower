import assert from "node:assert/strict";
import { createMetrikaClient } from "./monthly-listeners-provider.mjs";
import { classifySpotifyIdentity, spotifyArtistIdFromUrl } from "../lib/api/musicSpotifyIdentity.ts";

const ids = Array.from({ length: 11 }, (_, index) => `0123456789abcdefghij${String(index).padStart(2, "0")}`);
assert.equal(spotifyArtistIdFromUrl(`https://open.spotify.com/artist/${ids[0]}`), ids[0]);
assert.equal(spotifyArtistIdFromUrl("https://open.spotify.com/artist/not-an-id"), null);
assert.equal(classifySpotifyIdentity("00000000-0000-0000-0000-000000000001", "A", [ids[0]], [ids[0]]).status, "both_agree");
assert.equal(classifySpotifyIdentity("00000000-0000-0000-0000-000000000001", "A", [ids[0]], [ids[1]]).status, "conflict");
assert.equal(classifySpotifyIdentity("00000000-0000-0000-0000-000000000001", "A", [ids[0], ids[1]], []).status, "ambiguous");

const batches = [];
const client = createMetrikaClient({ token: "test-token-never-log", minimumSpacingMs: 0, sleepImpl: async () => {}, fetchImpl: async (_url, init) => {
  assert.equal(new Headers(init.headers).get("authorization"), "Bearer test-token-never-log");
  const body = JSON.parse(init.body);
  batches.push(body.resources);
  return new Response(JSON.stringify({ data: body.resources.map((resource) => ({ ...resource, status: "available",
    metrics: { views: { status: "available", value: 12345, semantic: "monthly listeners", collected_at: "2026-11-02T00:00:00Z" } } })) }), { status: 200 });
} });
const output = await client.searchSpotifyArtists(ids);
assert.deepEqual(batches.map((batch) => batch.length), [10, 1]);
assert.equal(output.length, 11);
assert.equal(output[0].monthlyListeners, 12345);
assert.equal(client.requestCount, 2);

const bad = createMetrikaClient({ token: "sensitive", minimumSpacingMs: 0, fetchImpl: async () => new Response("credential-bearing body", { status: 401 }) });
await assert.rejects(bad.searchSpotifyArtists([ids[0]]), (error) => !error.message.includes("sensitive") && !error.message.includes("credential-bearing"));
console.log("Monthly listeners mocked validation passed.");
