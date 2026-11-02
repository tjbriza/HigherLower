import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ApiFetchError, GameItem } from "@/types/api";

const PATH = "lib/api/data/monthly-listeners.snapshot.json";
export const MONTHLY_LISTENERS_WARNING_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MONTHLY_LISTENERS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SNAPSHOT_VERSION = 1;

export interface MonthlyListenersSnapshot {
  readonly version: 1;
  readonly category: "monthly-listeners";
  readonly generatedAt: string;
  readonly collectedAt: string;
  readonly source: string;
  readonly items: readonly GameItem[];
}

export function parseMonthlyListenersSnapshot(
  raw: unknown,
  now = Date.now(),
): MonthlyListenersSnapshot {
  const fail = (message: string): never => { throw new ApiFetchError("MonthlyListenersSnapshot", null, message); };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("Snapshot is not an object.");
  const value = raw as Record<string, unknown>;
  if (
    value.version !== SNAPSHOT_VERSION ||
    value.category !== "monthly-listeners" ||
    typeof value.generatedAt !== "string" ||
    typeof value.collectedAt !== "string" ||
    typeof value.source !== "string" ||
    !Array.isArray(value.items)
  ) {
    return fail("Snapshot schema is invalid.");
  }
  const generatedAt = Date.parse(value.generatedAt);
  const collectedAt = Date.parse(value.collectedAt);
  const generatedAge = now - generatedAt;
  const collectionAge = now - collectedAt;
  if (
    !Number.isFinite(generatedAt) ||
    generatedAt > now ||
    !Number.isFinite(collectedAt) ||
    collectedAt > now ||
    collectedAt > generatedAt ||
    generatedAge > MONTHLY_LISTENERS_MAX_AGE_MS ||
    collectionAge > MONTHLY_LISTENERS_MAX_AGE_MS
  ) {
    return fail("Snapshot is beyond its 14-day hard-stale limit.");
  }
  const ids = new Set<string>();
  const items: GameItem[] = [];
  for (const candidate of value.items) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return fail("Snapshot contains malformed item.");
    }
    const item = candidate as Record<string, unknown>;
    if (
      typeof item.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(item.id) ||
      ids.has(item.id) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      typeof item.imageUrl !== "string" ||
      !item.imageUrl.startsWith("https://") ||
      typeof item.value !== "number" ||
      !Number.isSafeInteger(item.value) ||
      item.value < 0 ||
      item.displayValue !==
        `${item.value.toLocaleString("en-US")} monthly listeners` ||
      Object.keys(item).some(
        (key) =>
          ![
            "id",
            "name",
            "imageUrl",
            "value",
            "displayValue",
            "attribution",
          ].includes(key),
      )
    ) {
      return fail("Snapshot item failed validation.");
    }
    ids.add(item.id);
    items.push({
      id: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      value: item.value,
      displayValue: item.displayValue as string,
      ...(typeof item.attribution === "string"
        ? { attribution: item.attribution }
        : {}),
    });
  }
  if (items.length < 2) {
    return fail("Snapshot contains fewer than two items.");
  }
  return {
    version: 1,
    category: "monthly-listeners",
    generatedAt: value.generatedAt,
    collectedAt: value.collectedAt,
    source: value.source,
    items,
  };
}

export function monthlyListenersFreshnessWarning(
  snapshot: Pick<MonthlyListenersSnapshot, "generatedAt" | "collectedAt">,
  now = Date.now(),
): string | null {
  const generatedAge = now - Date.parse(snapshot.generatedAt);
  const collectionAge = now - Date.parse(snapshot.collectedAt);
  if (
    generatedAge >= MONTHLY_LISTENERS_WARNING_AGE_MS ||
    collectionAge >= MONTHLY_LISTENERS_WARNING_AGE_MS
  ) {
    return `[MonthlyListenersSnapshot] Snapshot freshness warning: generation age ${Math.floor(generatedAge / 86_400_000)} days; collection age ${Math.floor(collectionAge / 86_400_000)} days.`;
  }
  return null;
}

export function readMonthlyListenersSnapshot(): MonthlyListenersSnapshot {
  let text: string;
  try {
    text = readFileSync(join(process.cwd(), PATH), "utf8");
  } catch {
    throw new ApiFetchError("MonthlyListenersSnapshot", null, "Snapshot missing at " + PATH + ".");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiFetchError(
      "MonthlyListenersSnapshot",
      null,
      "Snapshot is not valid JSON.",
    );
  }
  const snapshot = parseMonthlyListenersSnapshot(raw);
  const warning = monthlyListenersFreshnessWarning(snapshot);
  if (warning) console.warn(warning);
  return snapshot;
}

export async function fetchMonthlyListenersFromSnapshot(): Promise<GameItem[]> {
  return [...readMonthlyListenersSnapshot().items];
}
