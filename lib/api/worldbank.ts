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
 *   imageUrl     = flagcdn.com PNG flag (320px wide)
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
  country: { id: string; value: string };
  countryiso3code: string;
  value: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WB_URL =
  "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL" +
  "?format=json&mrv=1&per_page=300";

const FLAG_CDN = "https://flagcdn.com/w320";

/** Skip tiny territories (pop < 500k) — too obscure to be interesting */
const MIN_POPULATION = 500_000;

/**
 * Exhaustive allowlist of UN member states + a handful of widely-recognised
 * non-member observer states (Vatican, Palestine).
 *
 * The World Bank data includes territories, dependencies, and statistical
 * aggregate groupings (all rejected here). Any ISO-2 code NOT in this set
 * is silently dropped, even if it passes the regex test.
 *
 * Source: UN member state list (193 members + 2 observers) mapped to ISO 3166-1 alpha-2.
 */
const SOVEREIGN_COUNTRIES = new Set([
  "AF","AL","DZ","AD","AO","AG","AR","AM","AU","AT","AZ",
  "BS","BH","BD","BB","BY","BE","BZ","BJ","BT","BO","BA","BW","BR","BN","BG","BF","BI",
  "CV","KH","CM","CA","CF","TD","CL","CN","CO","KM","CG","CD","CR","CI","HR","CU","CY","CZ",
  "DK","DJ","DM","DO",
  "EC","EG","SV","GQ","ER","EE","SZ","ET",
  "FJ","FI","FR",
  "GA","GM","GE","DE","GH","GR","GD","GT","GN","GW","GY",
  "HT","HN","HU",
  "IS","IN","ID","IR","IQ","IE","IL","IT",
  "JM","JP","JO",
  "KZ","KE","KI","KP","KR","KW","KG",
  "LA","LV","LB","LS","LR","LY","LI","LT","LU",
  "MG","MW","MY","MV","ML","MT","MH","MR","MU","MX","FM","MD","MC","MN","ME","MA","MZ","MM",
  "NA","NR","NP","NL","NZ","NI","NE","NG","NO",
  "OM",
  "PK","PW","PA","PG","PY","PE","PH","PL","PT",
  "QA",
  "RO","RU","RW",
  "KN","LC","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SK","SI","SB","SO","ZA","SS","ES","LK","SD","SR","SE","CH","SY",
  "TW","TJ","TZ","TH","TL","TG","TO","TT","TN","TR","TM","TV",
  "UG","UA","AE","GB","US","UY","UZ",
  "VU","VE","VN",
  "YE",
  "ZM","ZW",
  // Widely-recognised non-UN-member states with flagcdn support
  "PS","VA","XK",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPopulation(n: number): string {
  return n.toLocaleString("en-US");
}

/** Returns the flagcdn PNG URL for a given ISO-2 code (always lowercase) */
function flagUrl(iso2: string): string {
  return `${FLAG_CDN}/${iso2.toLowerCase()}.png`;
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export async function fetchCountryPopulations(): Promise<GameItem[]> {
  const res = await fetch(WB_URL, {
    next: { revalidate: 60 * 60 * 24 }, // cache 24 h — population changes annually
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

      // ① Must be a sovereign country we recognise
      if (!SOVEREIGN_COUNTRIES.has(iso2)) return false;

      // ② Must have a non-empty name
      if (!r.country?.value?.trim()) return false;

      // ③ Must have a real population figure
      if (r.value === null || r.value === 0) return false;

      // ④ Must meet the minimum population threshold
      if (r.value < MIN_POPULATION) return false;

      return true;
    })
    .map<GameItem>((r) => ({
      id: r.country.id,
      name: r.country.value,
      // flagcdn always has a flag for every sovereign country code
      imageUrl: flagUrl(r.country.id),
      value: r.value as number,
      displayValue: formatPopulation(r.value as number),
    }))
    .sort((a, b) => b.value - a.value);

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
