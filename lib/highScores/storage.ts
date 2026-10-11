import { SEMANTIC_CATEGORIES } from "@/lib/catalog/semanticCatalog";
import type {
  HighScoreEnvelope,
  HighScoreIdentity,
  HighScoreMode,
  HighScoreRecord,
  LegacyMigrationReport,
  PreservedLegacyScore,
  StorageOperationResult,
} from "./types";

export const HIGH_SCORE_STORAGE_KEY = "higherlower.highscores.v1";
export const HIGH_SCORE_MIGRATION_METADATA_KEY =
  "higherlower.highscores.migration.v1";

const LEGACY_NAMESPACES = [
  { prefix: "hl-highscore-classic-", mode: "classic" },
  { prefix: "time_attack_highscore_", mode: "time-attack" },
] as const satisfies ReadonlyArray<{ prefix: string; mode: HighScoreMode }>;

const CATEGORY_IDS = new Set<string>(
  SEMANTIC_CATEGORIES.map((category) => category.id),
);
const scoreListeners = new Set<() => void>();

function notifyHighScoreChange(): void {
  scoreListeners.forEach((listener) => listener());
}

function handleStorageChange(event: StorageEvent): void {
  if (
    event.key === null ||
    event.key === HIGH_SCORE_STORAGE_KEY ||
    event.key === HIGH_SCORE_MIGRATION_METADATA_KEY ||
    LEGACY_NAMESPACES.some(({ prefix }) => event.key?.startsWith(prefix))
  ) {
    notifyHighScoreChange();
  }
}

/** Subscribe to same-tab and cross-tab changes to browser High Score storage. */
export function subscribeHighScores(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const wasEmpty = scoreListeners.size === 0;
  scoreListeners.add(listener);
  if (wasEmpty) window.addEventListener("storage", handleStorageChange);

  return () => {
    scoreListeners.delete(listener);
    if (scoreListeners.size === 0) {
      window.removeEventListener("storage", handleStorageChange);
    }
  };
}

/** Stable external-store snapshot for React consumers of High Score storage. */
export function getHighScoreStorageSnapshot(): string {
  const storage = getStorage();
  if (!storage) return "unavailable";
  try {
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    )
      .filter(
        (key): key is string =>
          key === HIGH_SCORE_STORAGE_KEY ||
          key === HIGH_SCORE_MIGRATION_METADATA_KEY ||
          (key !== null &&
            LEGACY_NAMESPACES.some(({ prefix }) => key.startsWith(prefix))),
      )
      .sort();
    return keys.map((key) => `${key}=${storage.getItem(key) ?? ""}`).join("\n");
  } catch {
    return "unavailable";
  }
}

interface EnvelopeRead {
  valid: boolean;
  envelope: HighScoreEnvelope;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isMode(value: unknown): value is HighScoreMode {
  return value === "classic" || value === "time-attack";
}

function isIdentity(value: HighScoreIdentity): boolean {
  return (
    isMode(value.mode) &&
    typeof value.categoryId === "string" &&
    CATEGORY_IDS.has(value.categoryId)
  );
}

function isRecord(value: unknown): value is HighScoreRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<HighScoreRecord>;
  return (
    isIdentity(record as HighScoreIdentity) &&
    Number.isSafeInteger(record.bestScore) &&
    (record.bestScore ?? -1) >= 0
  );
}

function normalizeRecords(
  records: readonly HighScoreRecord[],
): HighScoreRecord[] {
  const byIdentity = new Map<string, HighScoreRecord>();
  for (const record of records) {
    const key = `${record.mode}:${record.categoryId}`;
    const previous = byIdentity.get(key);
    if (!previous || record.bestScore > previous.bestScore) {
      byIdentity.set(key, {
        mode: record.mode,
        categoryId: record.categoryId,
        bestScore: record.bestScore,
      });
    }
  }
  return Array.from(byIdentity.values());
}

function readEnvelope(storage: Storage): EnvelopeRead {
  let raw: string | null;
  try {
    raw = storage.getItem(HIGH_SCORE_STORAGE_KEY);
  } catch {
    return { valid: false, envelope: { version: 1, records: [] } };
  }

  if (raw === null)
    return { valid: true, envelope: { version: 1, records: [] } };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as Partial<HighScoreEnvelope>).version !== 1 ||
      !Array.isArray((parsed as Partial<HighScoreEnvelope>).records) ||
      !(parsed as HighScoreEnvelope).records.every(isRecord)
    ) {
      return { valid: false, envelope: { version: 1, records: [] } };
    }

    return {
      valid: true,
      envelope: {
        version: 1,
        records: normalizeRecords((parsed as HighScoreEnvelope).records),
      },
    };
  } catch {
    return { valid: false, envelope: { version: 1, records: [] } };
  }
}

function writeEnvelope(storage: Storage, envelope: HighScoreEnvelope): boolean {
  try {
    storage.setItem(HIGH_SCORE_STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/** Read the best score for an exact mode/category pair; absent or blocked storage yields zero. */
export function readHighScore(identity: HighScoreIdentity): number {
  if (!isIdentity(identity)) return 0;
  const storage = getStorage();
  if (!storage) return 0;
  const { valid, envelope } = readEnvelope(storage);
  if (!valid) return 0;
  return (
    envelope.records.find(
      (record) =>
        record.mode === identity.mode &&
        record.categoryId === identity.categoryId,
    )?.bestScore ?? 0
  );
}

/** Update a record only when the new score improves its existing best. */
export function writeHighScore(
  identity: HighScoreIdentity,
  score: number,
): StorageOperationResult<HighScoreRecord> {
  if (!isIdentity(identity) || !Number.isSafeInteger(score) || score < 0) {
    return { ok: false, reason: "invalid-identity" };
  }

  const storage = getStorage();
  if (!storage) return { ok: false, reason: "unavailable" };
  const { valid, envelope } = readEnvelope(storage);
  if (!valid) return { ok: false, reason: "invalid-data" };

  const existing = envelope.records.find(
    (record) =>
      record.mode === identity.mode &&
      record.categoryId === identity.categoryId,
  );
  const record: HighScoreRecord = {
    mode: identity.mode,
    categoryId: identity.categoryId,
    bestScore: Math.max(existing?.bestScore ?? 0, score),
  };

  if (existing && existing.bestScore >= score) {
    return { ok: true, value: record };
  }

  const records = existing
    ? envelope.records.map((item) =>
        item.mode === identity.mode && item.categoryId === identity.categoryId
          ? record
          : item,
      )
    : [...envelope.records, record];

  if (!writeEnvelope(storage, { version: 1, records })) {
    return { ok: false, reason: "unavailable" };
  }
  notifyHighScoreChange();
  return { ok: true, value: record };
}

/** List canonical records, optionally restricted to an exact mode/category scope. */
export function listHighScores(
  filter: Partial<HighScoreIdentity> = {},
): HighScoreRecord[] {
  if (
    (filter.mode !== undefined && !isMode(filter.mode)) ||
    (filter.categoryId !== undefined && !CATEGORY_IDS.has(filter.categoryId))
  ) {
    return [];
  }
  const storage = getStorage();
  if (!storage) return [];
  const { valid, envelope } = readEnvelope(storage);
  if (!valid) return [];
  return envelope.records.filter(
    (record) =>
      (filter.mode === undefined || record.mode === filter.mode) &&
      (filter.categoryId === undefined ||
        record.categoryId === filter.categoryId),
  );
}

/** Remove only the canonical record matching this exact mode/category pair. */
export function clearLeaderboard(
  identity: HighScoreIdentity,
): StorageOperationResult<number> {
  if (!isIdentity(identity)) return { ok: false, reason: "invalid-identity" };
  const storage = getStorage();
  if (!storage) return { ok: false, reason: "unavailable" };
  const { valid, envelope } = readEnvelope(storage);
  if (!valid) return { ok: false, reason: "invalid-data" };

  const records = envelope.records.filter(
    (record) =>
      record.mode !== identity.mode ||
      record.categoryId !== identity.categoryId,
  );
  const removedCount = envelope.records.length - records.length;
  if (removedCount === 0) return { ok: true, value: 0 };
  if (!writeEnvelope(storage, { version: 1, records })) {
    return { ok: false, reason: "unavailable" };
  }
  notifyHighScoreChange();
  return { ok: true, value: removedCount };
}

/**
 * Inspect legacy score namespaces without importing any record. All recognized
 * legacy records remain in place as unresolved until a separately approved
 * mapping is available.
 */
export function migrateLegacyHighScores(): LegacyMigrationReport {
  const storage = getStorage();
  if (!storage) {
    return {
      status: "unavailable",
      migratedCount: 0,
      preservedCount: 0,
      preserved: [],
    };
  }

  const preserved = readRecognizedLegacyScores(storage);
  return {
    status: "preserved",
    migratedCount: 0,
    preservedCount: preserved.length,
    preserved,
  };
}

/** Clear canonical data and only well-formed HigherLower legacy score keys. */
export function clearAllHighScores(confirmed: boolean): StorageOperationResult<{
  canonicalRecordsRemoved: number;
  legacyRecordsRemoved: number;
}> {
  if (confirmed !== true) {
    return { ok: false, reason: "confirmation-required" };
  }
  const storage = getStorage();
  if (!storage) return { ok: false, reason: "unavailable" };
  const { envelope } = readEnvelope(storage);

  const legacy = readRecognizedLegacyScores(storage);
  try {
    storage.removeItem(HIGH_SCORE_STORAGE_KEY);
    storage.removeItem(HIGH_SCORE_MIGRATION_METADATA_KEY);
    legacy.forEach((record) => storage.removeItem(record.key));
    notifyHighScoreChange();
    return {
      ok: true,
      value: {
        canonicalRecordsRemoved: envelope.records.length,
        legacyRecordsRemoved: legacy.length,
      },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function readRecognizedLegacyScores(storage: Storage): PreservedLegacyScore[] {
  const records: PreservedLegacyScore[] = [];
  let keys: string[];
  try {
    keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    ).filter((key): key is string => key !== null);
  } catch {
    return records;
  }

  for (const key of keys) {
    const namespace = LEGACY_NAMESPACES.find(({ prefix }) =>
      key.startsWith(prefix),
    );
    if (!namespace) continue;
    const legacyCategoryId = key.slice(namespace.prefix.length);
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(legacyCategoryId)) continue;

    let rawScore: string | null;
    try {
      rawScore = storage.getItem(key);
    } catch {
      continue;
    }
    if (rawScore === null || !/^(0|[1-9]\d*)$/.test(rawScore)) continue;
    const score = Number(rawScore);
    if (!Number.isSafeInteger(score)) continue;

    records.push({
      key,
      mode: namespace.mode,
      legacyCategoryId,
      score,
      status: "unresolved",
    });
  }

  return records;
}
