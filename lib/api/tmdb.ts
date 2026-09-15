/**
 * TMDB fetcher — Popular Movies
 *
 * Endpoint: https://api.themoviedb.org/3/movie/popular
 * Requires:  TMDB_API_KEY  (server-only env var, no NEXT_PUBLIC_ prefix)
 *
 * GameItem mapping:
 *   value        = vote_average  (0–10 scale)
 *   displayValue = "${vote_average} / 10"
 */

import { GameItem, ApiFetchError } from "@/types/api";

// ─── Raw API types ────────────────────────────────────────────────────────────

interface TmdbMovie {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  vote_count: number;
}

interface TmdbResponse {
  results: TmdbMovie[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w780"; // 780px wide — high quality
/**
 * Number of pages to fetch from TMDB so we have a rich pool of cards.
 * Each page returns up to 20 results; 5 pages ≈ 100 candidates.
 */
const PAGES_TO_FETCH = 5;

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export async function fetchMovieRatings(): Promise<GameItem[]> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new ApiFetchError(
      "TMDB",
      null,
      "TMDB_API_KEY is not set. Add it to your .env.local file.",
    );
  }

  const pageRequests = Array.from({ length: PAGES_TO_FETCH }, (_, i) =>
    fetch(
      `${BASE_URL}/movie/popular?api_key=${apiKey}&language=en-US&page=${i + 1}`,
      // Cache for 6 hours — popular movies don't change that often
      { next: { revalidate: 60 * 60 * 6 } },
    ),
  );

  const responses = await Promise.all(pageRequests);

  const movies: TmdbMovie[] = [];
  for (const res of responses) {
    if (!res.ok) {
      throw new ApiFetchError("TMDB", res.status, `HTTP ${res.status}: ${res.statusText}`);
    }
    const data: TmdbResponse = await res.json();
    movies.push(...data.results);
  }

  return movies
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
