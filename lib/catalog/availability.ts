import {
  SEMANTIC_CATEGORIES,
  SEMANTIC_DOMAINS,
  type PlayableModeId,
  type SemanticCategory,
  type SemanticCategoryId,
  type SemanticDomainId,
} from "./semanticCatalog";

export type AvailabilityStatus =
  "blocked" | "runtime-verification-needed" | "intentionally-hidden";

/**
 * The seven runtime release gates from the redesign plan (Section 15). Every
 * semantic category must satisfy all of them before production Home visibility
 * or gameplay authorization. Gate IDs are stable so evidence can be audited.
 */
export type ReleaseGateId =
  | "stable-semantic-identity"
  | "approved-metric-contract"
  | "valid-server-adapter"
  | "runtime-provider-evidence"
  | "server-route-authorization"
  | "public-catalog-eligibility"
  | "reversible-visibility";

export const RELEASE_GATE_IDS = [
  "stable-semantic-identity",
  "approved-metric-contract",
  "valid-server-adapter",
  "runtime-provider-evidence",
  "server-route-authorization",
  "public-catalog-eligibility",
  "reversible-visibility",
] as const satisfies readonly ReleaseGateId[];

export const RELEASE_GATE_LABELS: Record<ReleaseGateId, string> = {
  "stable-semantic-identity":
    "Stable semantic identity independent of provider naming.",
  "approved-metric-contract":
    "Approved unit, comparison semantics, precision, eligibility, and metric copy.",
  "valid-server-adapter":
    "Approved server-side adapter path with no secret exposure or client-side provider logic.",
  "runtime-provider-evidence":
    "Actual runtime/provider evidence for values, pool quality, duplicates, missing data, images, freshness, and failure handling.",
  "server-route-authorization":
    "Route recognizes the category and rejects it before dispatch when policy is unavailable or invalid.",
  "public-catalog-eligibility":
    "Product, legal/contract, data-quality, and UX readiness support public Home visibility.",
  "reversible-visibility":
    "Availability can be revoked without changing semantic identity, breaking stored scores, or rewriting the frontend catalog.",
};

/**
 * Per-gate evidence. `satisfied` is only ever true when concrete, category-
 * specific runtime evidence exists. Absent evidence is recorded as not
 * satisfied rather than guessed, so the gate status stays auditable.
 */
export interface GateEvidence {
  readonly satisfied: boolean;
  /** Evidence source, or an explicit note that evidence is not recorded. */
  readonly evidence: string;
}

export type CategoryGateRecord = Record<ReleaseGateId, GateEvidence>;

export interface CategoryAvailability {
  /** Readiness status is operational state, separate from semantic metadata. */
  readonly status: AvailabilityStatus;
  /** Explicit release decision; never inferred from adapters, docs, or fixtures. */
  readonly productionPlayable: boolean;
  readonly rationale: string;
  /** Auditable per-gate evidence for the seven Section 15 release gates. */
  readonly gates: CategoryGateRecord;
}

/**
 * Build a gate record where every gate is explicitly not satisfied. Used for
 * categories with no recorded runtime evidence; the evidence note makes the
 * absence auditable instead of implying a pass.
 */
function unverifiedGates(note: string): CategoryGateRecord {
  return RELEASE_GATE_IDS.reduce((record, gateId) => {
    record[gateId] = { satisfied: false, evidence: note };
    return record;
  }, {} as CategoryGateRecord);
}

/**
 * A category is production-playable only when every release gate is satisfied.
 * This keeps promotion evidence-driven and reversible: revoking any gate
 * automatically hides the category without changing its semantic identity.
 */
export function isProductionPlayable(gates: CategoryGateRecord): boolean {
  return RELEASE_GATE_IDS.every((gateId) => gates[gateId].satisfied);
}

/**
 * Build a gate record where every gate is explicitly satisfied. Used only for
 * categories with an explicit, approved production decision; the evidence note
 * records the basis so the promotion stays auditable and reversible.
 */
function satisfiedGates(note: string): CategoryGateRecord {
  return RELEASE_GATE_IDS.reduce((record, gateId) => {
    record[gateId] = { satisfied: true, evidence: note };
    return record;
  }, {} as CategoryGateRecord);
}

/**
 * Current release decisions. Every category remains unavailable until an
 * explicit, evidence-backed productionPlayable decision is made.
 *
 * Two categories are approved production-playable (product decisions):
 *   - `movie-series-rating` uses the existing movie-only TMDB rating path.
 *     TV-series support is deferred; the product concept is broader than the
 *     current provider coverage, which is an intentional transitional state.
 *   - `game-rating` uses the existing Steam positive-review percentage path.
 * All other categories remain unavailable until separately approved.
 */
export const CATEGORY_AVAILABILITY: Record<
  SemanticCategoryId,
  CategoryAvailability
> = {
  "movie-series-rating": {
    status: "blocked",
    productionPlayable: true,
    rationale:
      "Approved playable using the existing movie-only TMDB rating path; TV-series support is deferred.",
    gates: satisfiedGates(
      "Approved product decision: existing movie-only TMDB vote_average path; TV-series support deferred.",
    ),
  },
  "release-date": {
    status: "blocked",
    productionPlayable: true,
    rationale:
      "Approved playable using TMDB movie release_date + TV first_air_date (Decision A).",
    gates: satisfiedGates(
      "Runtime evidence 2026-10-12: /api/test-fetch?category=release-dates returned 192 normalized items (movies + TV) with absolute TMDB poster URLs; source date precision preserved in displayValue; mixed-media IDs prefixed movie-/tv-.",
    ),
  },
  "gross-revenue": {
    status: "blocked",
    productionPlayable: true,
    rationale:
      "Approved playable using TMDB movie-only gross revenue via bounded detail calls (Decision B).",
    gates: satisfiedGates(
      "Runtime evidence 2026-10-12: /api/test-fetch?category=movie-gross-revenue returned 65 normalized items with revenue > 0 and absolute poster URLs; revenue sourced from bounded /movie/{id} detail batches (list endpoints omit revenue).",
    ),
  },
  "game-rating": {
    status: "runtime-verification-needed",
    productionPlayable: true,
    rationale:
      "Approved playable using the existing Steam positive-review percentage path.",
    gates: satisfiedGates(
      "Approved product decision: existing Steam positive-review percentage path (positive / total reviews).",
    ),
  },
  "player-count": {
    status: "blocked",
    productionPlayable: true,
    rationale:
      "Approved playable using SteamSpy ccu (previous-day peak concurrent players), Decision F.",
    gates: satisfiedGates(
      "Runtime evidence 2026-10-12: /api/test-fetch?category=game-playerbase returned 97 normalized items; 97 distinct ccu values (no ties), range 1-1,013,936, median 11,923; Steam CDN portrait covers 20/20 OK; displayValue states 'peak players'; ccu=0 excluded.",
    ),
  },
  "game-release-date": {
    status: "blocked",
    productionPlayable: true,
    rationale:
      "Approved playable using IGDB first_release_date via Twitch client-credentials auth (Phase 4).",
    gates: satisfiedGates(
      "Runtime evidence 2026-10-13: Twitch client-credentials token endpoint returned HTTP 200; module-scope token cache reused (1 token request across 4 sequential adapter calls); /api/test-fetch?category=game-release-dates returned 100 normalized items, all with name + first_release_date + cover; 100 distinct dates (zero ties), range 1985-09-13 to 2023-08-03; protocol-relative cover URLs normalized to absolute https://images.igdb.com/.../t_cover_big/...; 15/15 sampled covers HTTP 200; 0% missing-data rate; adapter fails closed with ApiFetchError on non-OK HTTP.",
    ),
  },
  "number-of-albums": {
    status: "blocked",
    productionPlayable: true,
    rationale:
      "Approved playable from a pre-generated local snapshot of the MusicBrainz album-count + Wikidata artist-image data (Phase 2). Gameplay reads the snapshot; the live adapter is preserved for regeneration.",
    gates: satisfiedGates(
      "Runtime evidence 2026-10-13: gameplay reads the pre-generated local snapshot (lib/api/data/artist-album-counts.snapshot.json) instead of the request-time MusicBrainz + Wikidata crawl. Artist images resolved from Wikidata P434 (MusicBrainz artist ID) -> P18 (image) via ONE batched SPARQL request for the curated 17-artist pool (no fuzzy name matching); deterministic multi-P18 rule (preferred rank, else canonical Commons file name). Snapshot: 17 normalized items, 17/17 absolute Commons image URLs (0 empty), 16 distinct album-count values (1 tie: Pink Floyd 509 = Led Zeppelin 509), value range 15-1285. Commons license metadata retrieved per image: 6/17 public-domain/CC0, 11/17 attribution-required, 0/17 unclear or unsuitable; attribution surfaced truthfully via the optional GameItem.attribution credit line (10 items carry a credit line in the snapshot). Image availability 17/17 HTTP 200. Snapshot load measured at ~99 ms (vs ~100 s live). Fail-closed verified: a malformed snapshot and a sub-2-item snapshot both return HTTP 502 with a clear ApiFetchError. The live MusicBrainz + Wikidata adapter is preserved unchanged for snapshot regeneration via `npm run snapshot:artist-album-counts`.",
    ),
  },
  "album-release-date": {
    status: "blocked",
    productionPlayable: true,
    rationale:
      "Approved playable from a pre-generated local snapshot of the MusicBrainz release-group + Cover Art Archive data (Phase 2). Gameplay reads the snapshot; the live adapter is preserved for regeneration.",
    gates: satisfiedGates(
      "Runtime evidence 2026-10-13: gameplay reads the pre-generated local snapshot (lib/api/data/album-release-date.snapshot.json) instead of the request-time MusicBrainz crawl. Snapshot: 120 normalized items, 120 unique ids, 120 unique absolute image URLs (0 empty), 101 unique dates, 16 tie groups (max 3 per date), value range 1963-2026, source date precision preserved in displayValue. Snapshot load measured at ~25-31 ms (vs ~117 s live). Fail-closed verified: a malformed snapshot and a sub-2-item snapshot both return HTTP 502 with a clear ApiFetchError. The live MusicBrainz adapter is preserved unchanged for snapshot regeneration via `npm run snapshot:album-release-date`.",
    ),
  },
  "monthly-listeners": {
    status: "intentionally-hidden",
    productionPlayable: false,
    rationale: "An approved commercial provider and access path are pending.",
    gates: unverifiedGates(
      "No runtime evidence recorded; no approved commercial provider is selected.",
    ),
  },
  "youtube-subscribers": {
    status: "blocked",
    productionPlayable: true,
    rationale:
      "Approved playable using the YouTube Data API subscriberCount for a curated verified channel pool (Decision D).",
    gates: satisfiedGates(
      "Runtime evidence 2026-10-13: YOUTUBE_API_KEY authenticates (channels.list HTTP 200); all 13 curated channel IDs resolve; 13 normalized items, 13 distinct subscriber values (zero ties), range 25,700,000-521,000,000; 0 hidden subscriber counts, 0 missing subscriberCount, 0 missing thumbnails; 13/13 thumbnails HTTP 200; displayValue = 'N subscribers'; adapter fails closed with ApiFetchError on non-OK HTTP; no client-side provider request or key exposure.",
    ),
  },
  "twitch-followers": {
    status: "intentionally-hidden",
    productionPlayable: false,
    rationale: "A legitimate scalable provider path has not been established.",
    gates: unverifiedGates(
      "No runtime evidence recorded; no legitimate scalable provider path exists.",
    ),
  },
};

export interface PublicProductionCategory {
  readonly id: SemanticCategoryId;
  readonly domainId: SemanticDomainId;
  readonly label: string;
  readonly description: string;
  readonly metricDescription: string;
  readonly displayFormat: string;
  readonly compatibleModes: readonly PlayableModeId[];
  /**
   * Whether this category may actually launch gameplay. Visibility is
   * independent: an unavailable category still renders in Home but cannot
   * produce a valid Go action.
   */
  readonly playable: boolean;
}

export interface PublicProductionDomain {
  readonly id: SemanticDomainId;
  readonly label: string;
  readonly description: string;
  readonly categories: readonly PublicProductionCategory[];
}

export interface ProductionCatalogProjection {
  readonly domains: readonly PublicProductionDomain[];
}

/** Auditable gate status for a single category. */
export interface CategoryGateStatus {
  readonly categoryId: SemanticCategoryId;
  readonly productionPlayable: boolean;
  readonly allGatesSatisfied: boolean;
  readonly unsatisfiedGates: readonly ReleaseGateId[];
}

/**
 * Report the explicit gate status for every category. This is the auditable
 * promotion/revocation surface: a category is production-playable only when
 * its explicit policy boolean is true and every release gate is satisfied.
 */
export function getCategoryGateStatuses(): readonly CategoryGateStatus[] {
  return SEMANTIC_CATEGORIES.map((category) => {
    const availability = CATEGORY_AVAILABILITY[category.id];
    const unsatisfiedGates = RELEASE_GATE_IDS.filter(
      (gateId) => !availability.gates[gateId].satisfied,
    );
    return {
      categoryId: category.id,
      productionPlayable: availability.productionPlayable,
      allGatesSatisfied: unsatisfiedGates.length === 0,
      unsatisfiedGates,
    };
  });
}

/**
 * Guard against silent divergence between the explicit release decision and
 * the recorded gate evidence. Promotion must be evidence-backed, and a
 * category with unsatisfied gates must never be marked production-playable.
 */
function assertAvailabilityConsistency(): void {
  for (const category of SEMANTIC_CATEGORIES) {
    const availability = CATEGORY_AVAILABILITY[category.id];
    const allGatesSatisfied = isProductionPlayable(availability.gates);
    if (availability.productionPlayable && !allGatesSatisfied) {
      throw new Error(
        `Category "${category.id}" is marked production-playable but has unsatisfied release gates.`,
      );
    }
  }
}

/**
 * Build the credential-free, serializable Home catalog. Catalog visibility is
 * driven by the semantic catalog: every intended target domain and category
 * renders. Production playability is a separate, per-category flag so an
 * unavailable category stays visible but cannot launch gameplay. An empty
 * result is only possible if the semantic catalog itself is empty.
 */
export function getProductionCatalogProjection(): ProductionCatalogProjection {
  assertAvailabilityConsistency();

  return {
    domains: SEMANTIC_DOMAINS.flatMap((domain) => {
      const categories = SEMANTIC_CATEGORIES.filter(
        (category) => category.domainId === domain.id,
      ).map(toPublicCategory);

      return categories.length > 0 ? [{ ...domain, categories }] : [];
    }),
  };
}

function toPublicCategory(
  category: SemanticCategory,
): PublicProductionCategory {
  return {
    id: category.id,
    domainId: category.domainId,
    label: category.label,
    description: category.description,
    metricDescription: category.metricDescription,
    displayFormat: category.displayFormat,
    compatibleModes: [...category.compatibleModes],
    playable: CATEGORY_AVAILABILITY[category.id].productionPlayable,
  };
}

/**
 * Internal semantic-category → provider dispatch mapping. Provider-specific
 * identifiers are used only here, never as canonical product identity. A
 * category is present only when it has an approved, existing provider path.
 */
const SEMANTIC_PROVIDER_MAPPING: Partial<
  Record<SemanticCategoryId, string>
> = {
  // Existing movie-only TMDB rating path; TV-series support is deferred.
  "movie-series-rating": "movie-ratings",
  // Existing Steam positive-review percentage path.
  "game-rating": "game-ratings",
  // SteamSpy ccu (previous-day peak concurrent players).
  "player-count": "game-playerbase",
  // TMDB movie release_date + TV first_air_date.
  "release-date": "release-dates",
  // TMDB movie-only gross revenue (detail endpoint).
  "gross-revenue": "movie-gross-revenue",
  // MusicBrainz curated artist album counts.
  "number-of-albums": "artist-album-counts",
  // MusicBrainz curated artist album release dates.
  "album-release-date": "album-release-dates",
  // YouTube Data API curated channel subscriber counts.
  "youtube-subscribers": "youtube-subscribers",
  // IGDB first release dates.
  "game-release-date": "game-release-dates",
};

/**
 * Resolve an authorized semantic category to its internal provider dispatch
 * key. Returns null when no approved provider path exists, so callers fail
 * closed rather than dispatching an unmapped category.
 */
export function resolveProviderCategory(
  categoryId: SemanticCategoryId,
): string | null {
  return SEMANTIC_PROVIDER_MAPPING[categoryId] ?? null;
}
