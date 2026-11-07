export const MAX_REQUESTS = 350;
export const BATCH_SIZE = 10;
// Resource states that are not publishable get at most two delayed retries.
// Each retry is a new, budget-counted request; auth and other HTTP failures stop immediately.
export const MAX_STATE_RETRIES = 2;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const STATES = new Set(["available", "pending", "not_found", "stale", "unavailable"]);

export function createMetrikaClient({ token, fetchImpl = fetch, minimumSpacingMs = 650, sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), maxRequests = MAX_REQUESTS, beforeRequest = async () => {} }) {
  if (!token) throw new Error("METRIKA_API_TOKEN is not configured.");
  let requestCount = 0;
  let lastAt = 0;

  async function searchSpotifyArtists(ids) {
    if (ids.some((id) => !SPOTIFY_ID.test(id))) throw new Error("Invalid Spotify artist ID.");
    const uniqueIds = [...new Set(ids)];
    const results = [];
    for (let offset = 0; offset < uniqueIds.length; offset += BATCH_SIZE) {
      const requested = uniqueIds.slice(offset, offset + BATCH_SIZE);
      let batchResults;
      for (let retry = 0; retry <= MAX_STATE_RETRIES; retry += 1) {
        if (requestCount >= maxRequests) throw new Error("Metrika request budget exhausted.");
        await beforeRequest(requestCount + 1);
        const delay = Math.max(0, minimumSpacingMs - (Date.now() - lastAt));
        if (lastAt && delay) await sleepImpl(delay);
        lastAt = Date.now();
        requestCount += 1;
        let response;
        try {
          response = await fetchImpl("https://metrika.run/api/v1/resources/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ resources: requested.map((identifier) => ({ platform: "spotify", type: "account", identifier })) }),
          });
        } catch { throw new Error("Metrika request transport failure."); }
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get("retry-after"));
          if (Number.isFinite(retryAfter) && retryAfter > 0) await sleepImpl(retryAfter * 1000);
          throw new Error("Metrika rate limit reached; the run stopped without retrying.");
        }
        if (!response.ok) throw new Error(`Metrika request failed with HTTP ${response.status}.`);
        let payload;
        try { payload = await response.json(); } catch { throw new Error("Metrika returned malformed JSON."); }
        if (!payload || !Array.isArray(payload.data)) throw new Error("Metrika response is missing resource data.");
        if (payload.data.length !== requested.length) throw new Error("Metrika returned a partial resource batch.");
        batchResults = [];
        for (let index = 0; index < requested.length; index += 1) {
          const item = payload.data[index];
          if (!item || item.identifier !== requested[index] || item.platform !== "spotify" || item.type !== "account" || !STATES.has(item.status)) {
            throw new Error("Metrika returned an unexpected resource.");
          }
          let monthlyListeners = null;
          let collectedAt = null;
          if (item.status === "available") {
            const views = item.metrics?.views;
            if (views?.status !== "available" || views.semantic !== "monthly listeners" || !Number.isSafeInteger(views.value) || views.value < 0 ||
              typeof views.collected_at !== "string" || !Number.isFinite(Date.parse(views.collected_at))) throw new Error("Metrika monthly-listener metric failed validation.");
            monthlyListeners = views.value;
            collectedAt = views.collected_at;
          }
          batchResults.push({ identifier: item.identifier, status: item.status, monthlyListeners, collectedAt,
            imageUrl: item.attributes?.image_url ?? item.attributes?.imageUrl ?? null });
        }
        if (batchResults.every((item) => item.status === "available") || retry === MAX_STATE_RETRIES) break;
        await sleepImpl(1000 * (retry + 1));
      }
      results.push(...batchResults);
    }
    return results;
  }
  return { searchSpotifyArtists, get requestCount() { return requestCount; } };
}
