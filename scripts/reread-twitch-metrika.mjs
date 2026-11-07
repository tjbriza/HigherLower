import { readFile } from "node:fs/promises";
import { beginTwitchMetrikaRun, persistTwitchMetrikaResult } from "./twitch-metrika-persistence.mjs";

const INPUT = "lib/api/data/twitch-stream-candidates.json";
const BATCH_SIZE = 10;
const REQUEST_SPACING_MS = 700;
const TIMEOUT_MS = 30_000;
const TOKEN = process.env.METRIKA_API_TOKEN;
const ENDPOINT = "https://metrika.run/api/v1/resources/search";
const STATUSES = new Set(["available", "pending", "not_found", "stale", "unavailable"]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function loginKey(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function validateResponse(payload, logins) {
  if (!payload || !Array.isArray(payload.data) || payload.data.length !== logins.length) {
    throw new Error("Metrika response batch shape mismatch.");
  }
  return payload.data.map((item, index) => {
    if (!item || item.platform !== "twitch" || item.type !== "account" ||
      loginKey(item.identifier) !== logins[index] || !STATUSES.has(item.status)) {
      throw new Error("Metrika Twitch account response contract mismatch.");
    }
    let value = null;
    let collectedAt = null;
    if (item.status === "available") {
      const metric = item.metrics?.followers;
      if (!metric || metric.status !== "available" || metric.semantic !== "followers" ||
        !Number.isSafeInteger(metric.value) || metric.value < 0 ||
        typeof metric.collected_at !== "string" || !Number.isFinite(Date.parse(metric.collected_at))) {
        throw new Error("Metrika Twitch follower metric contract mismatch.");
      }
      value = metric.value;
      collectedAt = metric.collected_at;
    }
    return { login: logins[index], userId: String(item.attributes?.user_id ?? item.user_id ?? ""),
      status: item.status, value, collectedAt };
  });
}

if (!TOKEN) {
  fail("Metrika token configured: false; no requests made.");
} else {
  const candidateData = JSON.parse(await readFile(INPUT, "utf8"));
  const shortlist = candidateData.candidates.filter((item) => item?.classification === "provisional_shortlist");
  if (shortlist.length !== 200) throw new Error("Expected exactly 200 shortlisted candidates; no requests made.");
  const logins = shortlist.map((item) => loginKey(item.login));
  if (logins.some((login) => !/^[a-z0-9_]{1,25}$/.test(login)) || new Set(logins).size !== 200) {
    throw new Error("Candidate login validation failed; no requests made.");
  }
  const verifiedAt = new Date().toISOString();
  console.log(JSON.stringify({ tokenConfigured: true, candidateCount: shortlist.length, uniqueLogins: new Set(logins).size }));
  await beginTwitchMetrikaRun();
  let requestCount = 0;
  let lastRequestAt = 0;
  const counts = { available: 0, pending: 0, not_found: 0, stale: 0, unavailable: 0 };
  try {
    for (let offset = 0; offset < shortlist.length; offset += BATCH_SIZE) {
      const batch = shortlist.slice(offset, offset + BATCH_SIZE);
      const requested = batch.map((candidate) => loginKey(candidate.login));
      const wait = Math.max(0, REQUEST_SPACING_MS - (Date.now() - lastRequestAt));
      if (lastRequestAt && wait) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequestAt = Date.now();
      requestCount += 1;
      let response;
      try {
        response = await fetch(ENDPOINT, { method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ resources: requested.map((identifier) => ({ platform: "twitch", type: "account", identifier })) }) });
      } catch {
        throw new Error("Metrika Twitch account request transport failure; stopped without retry.");
      }
      if (!response.ok) throw new Error(`Metrika Twitch account request stopped at HTTP ${response.status}.`);
      let payload;
      try { payload = await response.json(); } catch { throw new Error("Metrika returned malformed JSON; stopped."); }
      const normalized = validateResponse(payload, requested);
      for (let index = 0; index < normalized.length; index += 1) {
        const result = normalized[index];
        result.userId = batch[index].userId;
        await persistTwitchMetrikaResult(result);
        counts[result.status] += 1;
      }
    }
    console.log(JSON.stringify({ requests: requestCount, submitted: shortlist.length, returned: Object.values(counts).reduce((a, b) => a + b, 0), statusCounts: counts, startedAt: verifiedAt, completed: true }));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Metrika Twitch account run failed safely.");
    console.log(JSON.stringify({ requests: requestCount, persistedCurrentRun: Object.values(counts).reduce((a, b) => a + b, 0), statusCounts: counts, completed: false }));
  }
}
