/**
 * Dev-only test endpoint for verifying the API service layer.
 *
 * Usage:
 *   GET /api/test-fetch?category=movie-ratings
 *   GET /api/test-fetch?category=game-playerbase
 *   GET /api/test-fetch?category=game-ratings
 *   GET /api/test-fetch?category=release-dates
 *   GET /api/test-fetch?category=movie-gross-revenue
 *   GET /api/test-fetch?category=artist-album-counts
 *   GET /api/test-fetch?category=album-release-dates
 *   GET /api/test-fetch?category=youtube-subscribers
 *   GET /api/test-fetch?category=game-release-dates
 *
 * Returns the first 5 normalised GameItem objects and a count summary.
 *
 * Snapshot generation mode (developer-run, dev-only):
 *   GET /api/test-fetch?category=album-release-dates&full=1
 * Returns the FULL, unshuffled normalized pool for the category so the
 * snapshot generator script can persist it. This reuses the existing live
 * adapter; it does not add a parallel provider path.
 *
 * MusicBrainz discovery handoff is POST-only and disabled in production.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  fetchGameItems,
  fetchGameItemsRaw,
  fetchAlbumReleaseDatesLive,
  fetchArtistAlbumCountsLive,
  ApiFetchError,
} from "@/lib/api";
import {
  generateArtistAlbumCounts,
  generateAlbumReleaseDates,
} from "@/lib/api/musicbrainz";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category");
  const full = searchParams.get("full") === "1";

  if (!category) {
    return NextResponse.json(
      {
        error: "Missing ?category= query parameter",
        validValues: [
          "movie-ratings",
          "game-playerbase",
          "game-ratings",
          "release-dates",
          "movie-gross-revenue",
          "artist-album-counts",
          "album-release-dates",
          "youtube-subscribers",
          "game-release-dates",
        ],
      },
      { status: 400 },
    );
  }

  try {
    // Snapshot generation mode: return the full, unshuffled normalized pool.
    // For `album-release-dates` this deliberately runs the LIVE MusicBrainz
    // adapter (not the snapshot-backed gameplay path) so the snapshot can be
    // regenerated from the authoritative provider.
    if (full) {
      // Dev-only guard: never run the live crawl in a production build.
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          { error: "?full=1 is dev-only and is disabled in production" },
          { status: 404 },
        );
      }
      const items =
        category === "album-release-dates"
          ? await fetchAlbumReleaseDatesLive()
          : category === "artist-album-counts"
            ? await fetchArtistAlbumCountsLive()
            : await fetchGameItemsRaw(category);
      return NextResponse.json({
        category,
        totalItems: items.length,
        items,
      });
    }

    const items = await fetchGameItems(category);

    return NextResponse.json({
      category,
      totalItems: items.length,
      // Show first 5 so the response stays readable in the browser
      sample: items.slice(0, 5),
    });
  } catch (err) {
    if (err instanceof ApiFetchError) {
      return NextResponse.json(
        { error: err.message, source: err.source, statusCode: err.statusCode },
        { status: 502 },
      );
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}

const MBID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a developer-supplied exact artist list. Returns the normalized list
 * or null when the list is invalid, duplicated, or out of budget. Shared by the
 * Number of Albums and Album Release Date generation handoffs.
 */
function parseArtistList(
  value: unknown,
): { readonly mbid: string; readonly name: string }[] | null {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > 1000 ||
    value.some(
      (artist) =>
        !isRecord(artist) ||
        typeof artist.mbid !== "string" ||
        !MBID_PATTERN.test(artist.mbid) ||
        typeof artist.name !== "string" ||
        !artist.name.trim() ||
        artist.name.length > 200,
    )
  ) {
    return null;
  }
  const mbids = value
    .filter(isRecord)
    .map((artist) => artist.mbid)
    .filter((mbid): mbid is string => typeof mbid === "string");
  if (new Set(mbids).size !== value.length) return null;
  return value as { readonly mbid: string; readonly name: string }[];
}

/**
 * Developer-run discovery handoff; unavailable in production.
 *
 * Body: `{ category?: "artist-album-counts" | "album-release-dates",
 *          artists: { mbid, name }[], targetItems?: number }`
 *
 * `category` defaults to `artist-album-counts` for backward compatibility with
 * the existing Number of Albums generator. `targetItems` is only honored for
 * `album-release-dates` and bounds the target-fill generation budget.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Discovery is dev-only" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Expected an artist-list object" }, { status: 400 });
  }

  const category = body.category ?? "artist-album-counts";
  if (category !== "artist-album-counts" && category !== "album-release-dates") {
    return NextResponse.json(
      { error: "Unsupported generation category" },
      { status: 400 },
    );
  }

  const artists = parseArtistList(body.artists);
  if (!artists) {
    return NextResponse.json(
      { error: "Invalid, duplicate, or out-of-budget artist list" },
      { status: 400 },
    );
  }

  // Optional bounded generation target for album-release-dates only.
  let targetItems: number | undefined;
  if (category === "album-release-dates" && body.targetItems !== undefined) {
    if (
      typeof body.targetItems !== "number" ||
      !Number.isInteger(body.targetItems) ||
      body.targetItems < 2 ||
      body.targetItems > 1000
    ) {
      return NextResponse.json(
        { error: "Invalid targetItems budget" },
        { status: 400 },
      );
    }
    targetItems = body.targetItems;
  }

  try {
    const result =
      category === "album-release-dates"
        ? await generateAlbumReleaseDates(artists, { targetItems })
        : await generateArtistAlbumCounts(artists);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiFetchError) {
      return NextResponse.json(
        { error: err.message, source: err.source, statusCode: err.statusCode },
        { status: 502 },
      );
    }
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
