/**
 * TMDB fetchers
 *
 * Endpoints:
 *   https://api.themoviedb.org/3/movie/popular   (movie list)
 *   https://api.themoviedb.org/3/tv/popular      (TV list)
 *   https://api.themoviedb.org/3/movie/{id}      (movie detail — revenue)
 * Requires:  TMDB_API_KEY  (server-only env var, no NEXT_PUBLIC_ prefix)
 *
 * Fetchers:
 *   fetchMovieRatings()      → provider key "movie-ratings"
 *   fetchReleaseDates()      → provider key "release-dates"      (Movies + TV)
 *   fetchMovieGrossRevenue() → provider key "movie-gross-revenue" (Movies only)
 *
 * GameItem mapping:
 *   movie-ratings:      value = vote_average (0–10), displayValue = "x.x / 10"
 *   release-dates:      value = Date.parse(date) (epoch ms),
 *                       displayValue = source date string (precision preserved)
 *   movie-gross-revenue: value = revenue (integer USD),
 *                       displayValue = formatted currency
 */

import { GameItem, ApiFetchError } from "@/types/api";

// ─── Raw API types ────────────────────────────────────────────────────────────

interface TmdbMovie {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
  /** Present on list responses; may be "" when unknown. */
  release_date?: string;
}

interface TmdbTv {
  id: number;
  name: string;
  poster_path: string | null;
  /** Present on list responses; may be "" when unknown. */
  first_air_date?: string;
}

interface TmdbMovieDetail {
  id: number;
  title: string;
  poster_path: string | null;
  /** Detail-only field; integer USD, frequently 0. */
  revenue: number;
}

interface TmdbListResponse<T> {
  results: T[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w780"; // 780px wide — high quality

/**
 * Provider-specific bounded page budgets (Phase 5).
 *
 * These are explicit bounded request budgets for a specific TMDB list
 * operation — NOT a product-wide catalog cap. Each page returns up to 20
 * results. The budgets were chosen from measured Phase 5 diagnostics
 * (2026-10-15) and are evaluated per category:
 *
 *   - Rating: 10 pages ≈ 200 raw candidates → ~166 unique valid items
 *     (5 pages yielded ~82–85 with a cross-page duplicate ID). List pages are
 *     cheap, so the larger pool is retained.
 *   - Release Date: 10 pages per media type (movies + TV) ≈ 380 items with
 *     ~356 unique dates. Two list calls per page; still inexpensive.
 *   - Gross Revenue: 10 pages ≈ 186 candidates → ~146 valid revenue items.
 *     This is the highest-cost category because each candidate needs a
 *     `/movie/{id}` detail call; the budget is deliberately moderate and the
 *     detail fan-out stays bounded by `DETAIL_BATCH_SIZE`.
 */
const RATING_PAGES = 10;
const RELEASE_DATE_PAGES = 10;
const GROSS_REVENUE_CANDIDATE_PAGES = 10;
/** Bounded fan-out for movie-detail (revenue) requests. */
const DETAIL_BATCH_SIZE = 10;
/** Revenue is stable once a movie is released — cache detail calls for a week. */
const DETAIL_REVALIDATE = 60 * 60 * 24 * 7;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireApiKey(): string {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new ApiFetchError(
      "TMDB",
      null,
      "TMDB_API_KEY is not set. Add it to your .env.local file.",
    );
  }
  return apiKey;
}

/** Fetch a TMDB list endpoint across a bounded number of pages. */
async function fetchListPages<T>(
  path: string,
  apiKey: string,
  pages: number,
): Promise<T[]> {
  const pageRequests = Array.from({ length: pages }, (_, i) =>
    fetch(
      `${BASE_URL}${path}?api_key=${apiKey}&language=en-US&page=${i + 1}`,
      // Cache for 6 hours — popular titles don't change that often
      { next: { revalidate: 60 * 60 * 6 } },
    ),
  );

  const responses = await Promise.all(pageRequests);

  const results: T[] = [];
  for (const res of responses) {
    if (!res.ok) {
      throw new ApiFetchError(
        "TMDB",
        res.status,
        `HTTP ${res.status}: ${res.statusText}`,
      );
    }
    const data: TmdbListResponse<T> = await res.json();
    results.push(...data.results);
  }
  return results;
}

/** Deduplicate by a numeric id, keeping the first occurrence. */
function dedupeById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

export async function fetchMovieRatings(): Promise<GameItem[]> {
  const apiKey = requireApiKey();
  const movies = await fetchListPages<TmdbMovie>(
    "/movie/popular",
    apiKey,
    RATING_PAGES,
  );

  // TMDB popular pages can overlap between requests, so the same movie can
  // appear on more than one page. Deduplicate by id before mapping so the
  // normalized pool never contains a duplicate GameItem.id.
  return dedupeById(movies)
    .filter(
      (m) =>
        m.poster_path !== null && // must have an image
        m.vote_average > 0 &&     // skip unrated films
        m.vote_count >= 50,       // skip obscure titles with few votes
    )
    .map<GameItem>((m) => ({
      id: m.id,
      name: m.title,
      imageUrl: `${IMAGE_BASE}${m.poster_path}`,
      value: Math.round(m.vote_average * 10) / 10, // 1 decimal place
      displayValue: `${(Math.round(m.vote_average * 10) / 10).toFixed(1)} / 10`,
    }));
}

/**
 * Release dates for Movies AND TV Series (Decision A).
 *
 * Movies use `release_date`; TV uses `first_air_date`. Both normalize into the
 * same `release-date` category. Movie and TV IDs come from separate TMDB ID
 * namespaces and can collide numerically, so the normalized id is prefixed by
 * media type (`movie-<id>` / `tv-<id>`) to stay unique across the pool.
 */
export async function fetchReleaseDates(): Promise<GameItem[]> {
  const apiKey = requireApiKey();

  const [movies, tvShows] = await Promise.all([
    fetchListPages<TmdbMovie>("/movie/popular", apiKey, RELEASE_DATE_PAGES),
    fetchListPages<TmdbTv>("/tv/popular", apiKey, RELEASE_DATE_PAGES),
  ]);

  const movieItems = dedupeById(movies)
    .filter((m) => m.poster_path !== null && !!m.release_date)
    .map<GameItem>((m) => {
      const date = m.release_date as string;
      return {
        id: `movie-${m.id}`,
        name: m.title,
        imageUrl: `${IMAGE_BASE}${m.poster_path}`,
        value: Date.parse(date),
        displayValue: date, // preserve source precision
      };
    });

  const tvItems = dedupeById(tvShows)
    .filter((t) => t.poster_path !== null && !!t.first_air_date)
    .map<GameItem>((t) => {
      const date = t.first_air_date as string;
      return {
        id: `tv-${t.id}`,
        name: t.name,
        imageUrl: `${IMAGE_BASE}${t.poster_path}`,
        value: Date.parse(date),
        displayValue: date, // preserve source precision
      };
    });

  return [...movieItems, ...tvItems].filter((item) =>
    Number.isFinite(item.value),
  );
}

/**
 * Movie-only gross revenue (Decision B). TV revenue is never invented or
 * approximated.
 *
 * The `revenue` field is detail-only: `/movie/popular` list results do NOT
 * include it. We therefore fetch a bounded candidate pool from the list
 * endpoint, then retrieve detail records in bounded batches (no unbounded
 * N+1 fan-out). Only records with `revenue > 0` are kept.
 */
export async function fetchMovieGrossRevenue(): Promise<GameItem[]> {
  const apiKey = requireApiKey();

  const candidates = dedupeById(
    await fetchListPages<TmdbMovie>(
      "/movie/popular",
      apiKey,
      GROSS_REVENUE_CANDIDATE_PAGES,
    ),
  ).filter((m) => m.poster_path !== null);

  const details: TmdbMovieDetail[] = [];
  for (let i = 0; i < candidates.length; i += DETAIL_BATCH_SIZE) {
    const chunk = candidates.slice(i, i + DETAIL_BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(async (movie) => {
        const res = await fetch(
          `${BASE_URL}/movie/${movie.id}?api_key=${apiKey}&language=en-US`,
          { next: { revalidate: DETAIL_REVALIDATE } },
        );
        if (!res.ok) {
          throw new ApiFetchError(
            "TMDB",
            res.status,
            `HTTP ${res.status}: ${res.statusText}`,
          );
        }
        return (await res.json()) as TmdbMovieDetail;
      }),
    );
    details.push(...chunkResults);
  }

  return details
    .filter((d) => d.poster_path !== null && d.revenue > 0)
    .map<GameItem>((d) => ({
      id: d.id,
      name: d.title,
      imageUrl: `${IMAGE_BASE}${d.poster_path}`,
      value: d.revenue,
      displayValue: `$${d.revenue.toLocaleString("en-US")}`,
    }));
}
