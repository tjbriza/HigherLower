/**
 * FakeStore fetcher — Item Prices (PHP)
 *
 * Endpoint: https://fakestoreapi.com/products
 * No API key required.
 *
 * Currency conversion: USD × 56 → PHP
 *
 * GameItem mapping:
 *   value        = Math.round(price_usd * PHP_RATE)   (integer pesos)
 *   displayValue = "₱X,XXX"
 */

import { GameItem, ApiFetchError } from "@/types/api";

// ─── Raw API types ────────────────────────────────────────────────────────────

interface FakeStoreProduct {
  id: number;
  title: string;
  price: number; // in USD
  image: string;
  category: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://fakestoreapi.com";
/** USD → PHP conversion rate */
const PHP_RATE = 56;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats a Philippine Peso amount:
 *   1234.5 → "₱1,235"
 *   89999  → "₱89,999"
 */
function formatPhp(amount: number): string {
  return `₱${Math.round(amount).toLocaleString("en-PH")}`;
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

export async function fetchItemPrices(): Promise<GameItem[]> {
  const res = await fetch(
    `${BASE_URL}/products`,
    // Prices don't change — cache for 24 hours
    { next: { revalidate: 60 * 60 * 24 } },
  );

  if (!res.ok) {
    throw new ApiFetchError(
      "FakeStore",
      res.status,
      `HTTP ${res.status}: ${res.statusText}`,
    );
  }

  const products: FakeStoreProduct[] = await res.json();

  return products
    .filter(
      (p) =>
        p.price > 0 && // skip free / broken listings
        p.image &&     // must have a product image
        p.title,       // must have a name
    )
    .map<GameItem>((p) => {
      const phpPrice = p.price * PHP_RATE;
      const roundedPhp = Math.round(phpPrice);
      return {
        id: p.id,
        name: p.title,
        imageUrl: p.image,
        value: roundedPhp,
        displayValue: formatPhp(phpPrice),
      };
    });
}
