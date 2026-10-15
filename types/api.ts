/**
 * Normalised shape that every category fetcher must produce.
 * The game engine only ever works with this type — raw API shapes
 * are kept entirely inside each fetcher module.
 */
export interface GameItem {
  /** Stable identifier from the source API (string or numeric) */
  id: string | number;
  /** Human-readable name shown on the game card */
  name: string;
  /** Absolute URL to the poster / cover / product image */
  imageUrl: string;
  /** Raw numeric value used for higher/lower comparison */
  value: number;
  /** Formatted string shown to the player after the reveal */
  displayValue: string;
  /**
   * Optional image credit line, shown when the image's license requires
   * attribution (e.g. Wikimedia Commons CC BY / CC BY-SA files). Absent for
   * images that are public domain / CC0 or whose source requires no credit.
   * This is a truthful licensing surface, not a gameplay metric.
   */
  attribution?: string;
}

// ─── Typed fetch error ───────────────────────────────────────────────────────

export class ApiFetchError extends Error {
  constructor(
    public readonly source: string,
    public readonly statusCode: number | null,
    message: string,
  ) {
    super(`[${source}] ${message}`);
    this.name = "ApiFetchError";
  }
}
