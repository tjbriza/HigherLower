/**
 * World Bank / FlagCDN fetcher — Country Populations
 *
 * Population data: World Bank Open Data API (no key required)
 *   https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrv=1&per_page=300
 *
 * Flag images: flagcdn.com (free CDN, no key required)
 *   https://flagcdn.com/w320/{iso2}.png  (2-letter ISO code, lowercase)
 *
 * GameItem mapping:
 *   id           = iso2 country code (e.g. "PH", "US")
 *   name         = country.name (e.g. "Philippines")
 *   imageUrl     = flagcdn.com PNG flag
 *   value        = population (integer)
 *   displayValue = localised population string e.g. "117,337,368"
 */

import { GameItem, ApiFetchError } from "@/types/api";

// ─── Raw API types ────────────────────────────────────────────────────────────

interface WorldBankMeta {
  page: number;
  pages: number;
  per_page: number;
  total: number;
}

interface WorldBankRecord {
  /** 2-letter ISO country code (matches flagcdn.com) */
  country: { id: string; value: string };
  /** 3-letter ISO code — may be empty for aggregate regions */
  countryiso3code: string;
  value: number | null;
}

type WorldBankResponse = [WorldBankMeta, WorldBankRecord[]];

// ─── Constants ────────────────────────────────────────────────────────────────

const WB_URL =
  "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL" +
  "?format=json&mrv=1&per_page=300";

const FLAG_CDN = "https://flagcdn.com/w320";

/**
 * The World Bank mixes in aggregate "regions" (e.g. "East Asia & Pacific")
 * that have multi-letter codes like "Z4" or "1W".  We only want actual
 * countries, which always have exactly 2 uppercase alpha characters.
 */
const ISO2_RE = /^[A-Z]{2}$/;

/** Skip countries that are not interesting to compare (pop < 100k) */
const MIN_POPULATION = 100_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPopulation(n: number): string {
  return n.toLocaleString("en-US");
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export async function fetchCountryPopulations(): Promise<GameItem[]> {
  const res = await fetch(WB_URL, {
    // Population figures update ~annually — cache for 24 hours
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!res.ok) {
    throw new ApiFetchError(
      "WorldBank",
      res.status,
      `HTTP ${res.status}: ${res.statusText}`,
    );
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new ApiFetchError("WorldBank", null, "Response was not valid JSON");
  }

  if (!Array.isArray(raw) || raw.length < 2 || !Array.isArray(raw[1])) {
    throw new ApiFetchError("WorldBank", null, "Unexpected World Bank response shape");
  }

  const records = raw[1] as WorldBankRecord[];

  const items = records
    .filter((r) => {
      const iso2 = r.country?.id ?? "";
      if (!ISO2_RE.test(iso2)) return false;           // skip regions/aggregates
      if (!r.country?.value) return false;             // no name
      if (r.value === null || r.value === 0) return false; // no data
      if (r.value < MIN_POPULATION) return false;      // too small to be interesting
      return true;
    })
    .map<GameItem>((r) => {
      const iso2 = r.country.id.toLowerCase();
      return {
        id: r.country.id,
        name: r.country.value,
        imageUrl: `${FLAG_CDN}/${iso2}.png`,
        value: r.value as number,
        displayValue: formatPopulation(r.value as number),
      };
    })
    .sort((a, b) => b.value - a.value); // highest population first, game shuffles later

  console.log(`[WorldBank] Country populations loaded: ${items.length} countries`);

  if (items.length < 20) {
    throw new ApiFetchError(
      "WorldBank",
      null,
      `Only ${items.length} countries returned — API may be temporarily unavailable.`,
    );
  }

  return items;
}
