import "next/dist/compiled/server-only/index.js";

import { createMetrikaClient as createClient } from "../../scripts/monthly-listeners-provider.mjs";

/** Sanitized Metrika resource result. Raw provider payloads are never returned. */
export interface MetrikaResource {
  readonly platform: "spotify";
  readonly type: "account";
  readonly identifier: string;
  readonly status: "available" | "pending" | "not_found" | "stale" | "unavailable";
  readonly monthlyListeners: number | null;
  readonly collectedAt: string | null;
}

export interface MetrikaClientOptions {
  readonly token?: string; readonly fetchImpl?: typeof fetch; readonly minimumSpacingMs?: number;
  readonly sleepImpl?: (ms: number) => Promise<void>; readonly maxRequests?: number;
  readonly beforeRequest?: (requestNumber: number) => Promise<void>;
}
export type MetrikaClient = ReturnType<typeof createClient>;

/** Build a paced, bounded client; token access occurs only at this server boundary. */
export function createMetrikaClient(options: MetrikaClientOptions = {}): MetrikaClient {
  return createClient({ ...options, beforeRequest: options.beforeRequest as (() => Promise<void>) | undefined,
    token: options.token ?? process.env.METRIKA_API_TOKEN });
}
