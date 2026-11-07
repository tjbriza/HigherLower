/**
 * deck.ts — shared, narrowly scoped deck helpers for Classic and Time Attack.
 *
 * This is NOT a game engine. It contains only small pure functions that both
 * game components previously duplicated verbatim:
 *   - Fisher-Yates shuffle
 *   - adjacent equal-value avoidance
 *   - initial deck construction (hydration-safe: preserves server order)
 *   - explicit reshuffle for restarts
 *   - seen-ID filtering
 *   - Classic cycle construction (carry the unshown tail, reshuffle the rest)
 *
 * React components continue to own all gameplay state (score, phase, timers,
 * keyboard handling). These helpers are pure and return new arrays.
 *
 * Correctness rule: an item ID must not repeat until the available pool has
 * been consumed (Classic) or for the duration of the session (Time Attack).
 * Adjacent equal-value avoidance is only a secondary comparison-quality guard.
 */

import type { GameItem } from "@/types/api";

/** Fisher-Yates shuffle — returns a NEW array. */
export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Scans a deck and ensures no two consecutive items share the same `value`.
 * When a duplicate pair is found at position [i, i+1], it looks forward for
 * the nearest item at j >= i+2 whose value differs and swaps [i+1] with [j].
 * If no swap candidate exists the pair is left as-is (tiny edge case in small
 * pools with many identical values).
 */
export function dedupeAdjacentEquals(arr: GameItem[]): GameItem[] {
  const out = [...arr];
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].value === out[i + 1].value) {
      let j = i + 2;
      while (j < out.length && out[j].value === out[i].value) j++;
      if (j < out.length) {
        [out[i + 1], out[j]] = [out[j], out[i + 1]];
      }
    }
  }
  return out;
}

/** Drop items that cannot be rendered (missing image or name). */
export function filterUsable(pool: GameItem[]): GameItem[] {
  return pool.filter((item) => !!item.imageUrl && !!item.name);
}

/**
 * Build a clean, tie-free deck from the server pool. The server already
 * shuffles the pool per request, so the initial deck preserves that order to
 * keep server and client render identical (avoids a hydration mismatch).
 * `shuffleDeck` is used for explicit re-shuffles such as "Play again".
 */
export function buildDeck(pool: GameItem[]): GameItem[] {
  return dedupeAdjacentEquals(filterUsable(pool));
}

/** Shuffle a pool into a fresh deck (used for explicit restarts). */
export function shuffleDeck(pool: GameItem[]): GameItem[] {
  return dedupeAdjacentEquals(shuffle(filterUsable(pool)));
}

/**
 * Remove items whose ID is already in `seenIds`. Used to build the remaining
 * queue for a cycle/session without ever re-showing a consumed item.
 */
export function filterSeen(
  pool: GameItem[],
  seenIds: ReadonlySet<string | number>,
): GameItem[] {
  return pool.filter((item) => !seenIds.has(item.id));
}

/**
 * Construct the next Classic cycle when the current one is nearly exhausted.
 *
 * The current cycle ends when fewer than 2 items remain in the deck (no
 * `nextItem` is possible). At that point the unshown tail (`carried`, 0 or 1
 * items) must be preserved so no item is skipped, and the rest of the pool is
 * reshuffled into a fresh cycle.
 *
 * - `carried` items are prepended unchanged (they were never consumed).
 * - The fresh shuffle excludes carried IDs so nothing is duplicated.
 * - When nothing is carried, the first fresh item is protected from being the
 *   item just consumed, so it cannot immediately reappear at the boundary.
 * - Adjacent equal-value avoidance is applied across the junction.
 *
 * The caller resets its `seenIds` tracking for the new cycle.
 */
export function buildNextCycle(
  pool: GameItem[],
  carried: GameItem[],
  consumedId: string | number,
): GameItem[] {
  const carriedIds = new Set(carried.map((item) => item.id));
  const fresh = shuffle(
    filterUsable(pool).filter((item) => !carriedIds.has(item.id)),
  );

  // Protect the boundary only when nothing is carried over: the first fresh
  // item must not be the item just consumed.
  if (carried.length === 0 && fresh.length > 1 && fresh[0].id === consumedId) {
    const j = fresh.findIndex(
      (item, idx) => idx > 0 && item.id !== consumedId,
    );
    if (j > 0) [fresh[0], fresh[j]] = [fresh[j], fresh[0]];
  }

  return dedupeAdjacentEquals([...carried, ...fresh]);
}
