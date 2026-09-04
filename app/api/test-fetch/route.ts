/**
 * Dev-only test endpoint for verifying the API service layer.
 *
 * Usage:
 *   GET /api/test-fetch?category=movie-ratings
 *   GET /api/test-fetch?category=game-playerbase
 *   GET /api/test-fetch?category=game-ratings
 *   GET /api/test-fetch?category=item-prices
 *
 * Returns the first 5 normalised GameItem objects and a count summary.
 *
 * NOTE: Remove or gate this route before production deployment.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchGameItems, ApiFetchError } from "@/lib/api";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const category = searchParams.get("category");

  if (!category) {
    return NextResponse.json(
      {
        error: "Missing ?category= query parameter",
        validValues: ["movie-ratings", "game-playerbase", "game-ratings", "item-prices"],
      },
      { status: 400 },
    );
  }

  try {
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
