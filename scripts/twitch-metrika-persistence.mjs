import { readFile, rename, unlink, writeFile } from "node:fs/promises";

const STATUSES = new Set(["available", "pending", "not_found", "stale", "unavailable"]);
const OUTPUT = "lib/api/data/twitch-followers-metrika.snapshot.json";
const PERSISTED_FIELDS = ["login", "userId", "status", "value", "collectedAt", "retrievedAt"];

function validateRecord(record) {
  if (!record || typeof record.login !== "string" || !/^[a-z0-9_]{1,25}$/i.test(record.login) ||
    typeof record.userId !== "string" || !/^\d+$/.test(record.userId) || !STATUSES.has(record.status) ||
    (record.value !== null && (!Number.isSafeInteger(record.value) || record.value < 0)) ||
    (record.collectedAt !== null && (typeof record.collectedAt !== "string" || !Number.isFinite(Date.parse(record.collectedAt))))) {
    throw new Error("Invalid normalized Twitch Metrika result.");
  }
  if (record.status === "available" && (record.value === null || record.collectedAt === null)) {
    throw new Error("Available Twitch Metrika result requires a value and collection time.");
  }
  if (record.retrievedAt !== undefined &&
    (typeof record.retrievedAt !== "string" || !Number.isFinite(Date.parse(record.retrievedAt)))) {
    throw new Error("Invalid Twitch Metrika retrieval time.");
  }
}

function toPersistedRecord(record, retrievedAt) {
  validateRecord(record);
  if (!Number.isFinite(Date.parse(retrievedAt))) throw new Error("Invalid Twitch Metrika retrieval time.");
  return {
    login: record.login.toLowerCase(),
    userId: record.userId,
    status: record.status,
    value: record.value,
    collectedAt: record.collectedAt,
    retrievedAt,
  };
}

/** Persist one normalized result immediately; unknown fields/raw provider data are discarded. */
export async function persistTwitchMetrikaResult(record, {
  outputPath = OUTPUT,
  retrievedAt = new Date().toISOString(),
} = {}) {
  const safeRecord = toPersistedRecord(record, retrievedAt);
  let records = [];
  try {
    const current = JSON.parse(await readFile(outputPath, "utf8"));
    if (!current || current.version !== 1 || !Array.isArray(current.records)) {
      throw new Error("Twitch Metrika persistence artifact schema invalid.");
    }
    records = current.records.map((record) => {
      validateRecord(record);
      if (record.retrievedAt === undefined) throw new Error("Existing Twitch Metrika result lacks retrieval time.");
      return Object.fromEntries(PERSISTED_FIELDS.map((key) => [key, record[key]]));
    });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const existingIndex = records.findIndex((item) => item?.login === safeRecord.login);
  if (existingIndex === -1) records.push(safeRecord);
  else records[existingIndex] = safeRecord;
  records.sort((a, b) => a.login.localeCompare(b.login));

  const artifact = { version: 1, records };
  const tempPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    const serialized = JSON.parse(await readFile(tempPath, "utf8"));
    if (serialized.records.some((item) => Object.keys(item).length !== PERSISTED_FIELDS.length ||
      Object.keys(item).some((key) => !PERSISTED_FIELDS.includes(key)))) {
      throw new Error("Twitch Metrika persistence artifact contains an unexpected field.");
    }
    await rename(tempPath, outputPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
  return safeRecord;
}

/** Start a new census without carrying any prior-run metric values forward. */
export async function beginTwitchMetrikaRun({ outputPath = OUTPUT } = {}) {
  const artifact = { version: 1, records: [] };
  const tempPath = `${outputPath}.${process.pid}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    JSON.parse(await readFile(tempPath, "utf8"));
    await rename(tempPath, outputPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export { OUTPUT as TWITCH_METRIKA_RESULTS_PATH };
