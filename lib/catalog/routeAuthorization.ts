import {
  CATEGORY_AVAILABILITY,
  resolveProviderCategory,
} from "./availability";
import {
  SEMANTIC_CATEGORIES,
  type PlayableModeId,
  type SemanticCategory,
  type SemanticCategoryId,
} from "./semanticCatalog";

export type RouteAuthorizationResult =
  | { readonly status: "missing-category" }
  | { readonly status: "invalid-category" }
  | { readonly status: "unsupported-mode" }
  | {
      readonly status: "incompatible-mode";
      readonly mode: PlayableModeId;
      readonly category: SemanticCategory;
    }
  | {
      readonly status: "unavailable";
      readonly mode: PlayableModeId;
      readonly category: SemanticCategory;
      readonly categoryId: SemanticCategoryId;
      readonly reason: "production-readiness";
    }
  | {
      readonly status: "authorized";
      readonly mode: PlayableModeId;
      readonly category: SemanticCategory;
      readonly categoryId: SemanticCategoryId;
      /** Internal provider dispatch key; never canonical product identity. */
      readonly providerCategory: string;
    };

const PLAYABLE_MODES: readonly PlayableModeId[] = ["classic", "time-attack"];
const LEGACY_CATEGORY_IDS = new Set([
  "movie-ratings",
  "game-playerbase",
  "game-ratings",
  "country-populations",
]);

/**
 * The common fail-closed authorization boundary for every gameplay route.
 * Authorization is evaluated before a caller may invoke the provider dispatcher.
 */
export function authorizeGameRoute(
  modeInput: unknown,
  categoryInput: unknown,
): RouteAuthorizationResult {
  if (
    typeof modeInput !== "string" ||
    !PLAYABLE_MODES.includes(modeInput as PlayableModeId)
  ) {
    return { status: "unsupported-mode" };
  }

  if (
    categoryInput === undefined ||
    categoryInput === null ||
    categoryInput === ""
  ) {
    return { status: "missing-category" };
  }

  // A repeated category query is ambiguous and must not silently select one.
  if (typeof categoryInput !== "string") {
    return { status: "invalid-category" };
  }

  // Explicitly reject legacy provider/category IDs rather than remapping them.
  if (LEGACY_CATEGORY_IDS.has(categoryInput)) {
    return { status: "invalid-category" };
  }

  const category = SEMANTIC_CATEGORIES.find(
    (candidate) => candidate.id === categoryInput,
  );
  if (!category) {
    return { status: "invalid-category" };
  }

  const mode = modeInput as PlayableModeId;
  if (!category.compatibleModes.includes(mode)) {
    return { status: "incompatible-mode", mode, category };
  }

  if (!CATEGORY_AVAILABILITY[category.id].productionPlayable) {
    return {
      status: "unavailable",
      mode,
      category,
      categoryId: category.id,
      reason: "production-readiness",
    };
  }

  // A playable category must resolve to an approved provider path. If it does
  // not, fail closed rather than dispatching an unmapped category.
  const providerCategory = resolveProviderCategory(category.id);
  if (!providerCategory) {
    return {
      status: "unavailable",
      mode,
      category,
      categoryId: category.id,
      reason: "production-readiness",
    };
  }

  return {
    status: "authorized",
    mode,
    category,
    categoryId: category.id,
    providerCategory,
  };
}
