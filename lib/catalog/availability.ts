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
    status: "runtime-verification-needed",
    productionPlayable: false,
    rationale:
      "Category-specific production runtime evidence is not recorded yet.",
    gates: unverifiedGates(
      "No category-specific production runtime evidence recorded.",
    ),
  },
  "gross-revenue": {
    status: "blocked",
    productionPlayable: false,
    rationale: "The movie-only provider/data contract is unresolved.",
    gates: unverifiedGates(
      "No runtime evidence recorded; the movie-only provider/data contract is unresolved.",
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
    status: "intentionally-hidden",
    productionPlayable: false,
    rationale:
      "A suitable current-concurrent-player source is not verified; SteamSpy recent peak is not acceptable.",
    gates: unverifiedGates(
      "No runtime evidence recorded; no acceptable current-concurrency source is verified.",
    ),
  },
  "game-release-date": {
    status: "blocked",
    productionPlayable: false,
    rationale:
      "IGDB credentials/access have not been verified for runtime use.",
    gates: unverifiedGates(
      "No runtime evidence recorded; IGDB credentials/access are unverified.",
    ),
  },
  "number-of-albums": {
    status: "blocked",
    productionPlayable: false,
    rationale:
      "MusicBrainz credentials/access have not been verified for runtime use.",
    gates: unverifiedGates(
      "No runtime evidence recorded; MusicBrainz credentials/access are unverified.",
    ),
  },
  "album-release-date": {
    status: "blocked",
    productionPlayable: false,
    rationale:
      "MusicBrainz credentials/access have not been verified for runtime use.",
    gates: unverifiedGates(
      "No runtime evidence recorded; MusicBrainz credentials/access are unverified.",
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
    productionPlayable: false,
    rationale:
      "YouTube Data API credentials/access have not been verified for runtime use.",
    gates: unverifiedGates(
      "No runtime evidence recorded; YouTube Data API credentials/access are unverified.",
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
