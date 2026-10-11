import type {
  PlayableModeId,
  SemanticCategoryId,
} from "@/lib/catalog/semanticCatalog";

export type HighScoreMode = PlayableModeId;

/** Canonical identity is always mode + provider-independent category. */
export interface HighScoreIdentity {
  mode: HighScoreMode;
  categoryId: SemanticCategoryId;
}

export interface HighScoreRecord extends HighScoreIdentity {
  bestScore: number;
}

export interface HighScoreEnvelope {
  version: 1;
  records: HighScoreRecord[];
}

export interface PreservedLegacyScore {
  /** Exact localStorage key, retained only in the browser-side migration report. */
  key: string;
  mode: HighScoreMode;
  legacyCategoryId: string;
  score: number;
  status: "unresolved";
}

export interface LegacyMigrationReport {
  status: "preserved" | "unavailable";
  migratedCount: 0;
  preservedCount: number;
  preserved: PreservedLegacyScore[];
}

export type StorageOperationResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason:
        | "unavailable"
        | "invalid-data"
        | "invalid-identity"
        | "confirmation-required";
    };
