"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AlertTriangle, Trophy, X } from "lucide-react";
import { SEMANTIC_CATEGORIES } from "@/lib/catalog/semanticCatalog";
import type { HighScoreMode } from "@/lib/highScores/types";
import type { SemanticCategoryId } from "@/lib/catalog/semanticCatalog";
import {
  clearAllHighScores,
  clearLeaderboard,
  getHighScoreStorageSnapshot,
  listHighScores,
  migrateLegacyHighScores,
  subscribeHighScores,
} from "@/lib/highScores/storage";

interface HighScoresModalProps {
  open: boolean;
  onClose: () => void;
}

const MODES: readonly { id: HighScoreMode; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "time-attack", label: "Time Attack" },
];

const SEMANTIC_CATEGORY_BY_ID = new Map(
  SEMANTIC_CATEGORIES.map((category) => [category.id, category]),
);

export default function HighScoresModal({
  open,
  onClose,
}: HighScoresModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<HighScoreMode>("classic");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [showLeaderboardConfirmation, setShowLeaderboardConfirmation] =
    useState(false);
  const [announcement, setAnnouncement] = useState("");
  const storageSnapshot = useSyncExternalStore(
    subscribeHighScores,
    getHighScoreStorageSnapshot,
    () => "",
  );
  // The server snapshot is always "" because browser storage is unavailable
  // during SSR. Until the client snapshot differs, render the same empty state
  // the server produced so hydration stays consistent.
  const hydrated = storageSnapshot !== "";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      closeButtonRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    migrateLegacyHighScores();
  }, [open]);

  const scores = useMemo(() => {
    if (!hydrated) return [];
    return listHighScores({ mode })
      .map((record) => ({
        ...record,
        category: SEMANTIC_CATEGORY_BY_ID.get(record.categoryId),
      }))
      .filter((record) => record.category !== undefined)
      .filter(
        (record) =>
          categoryFilter === "all" || record.categoryId === categoryFilter,
      )
      .sort((left, right) => right.bestScore - left.bestScore);
  }, [categoryFilter, mode, hydrated]);

  const selectedCategory = SEMANTIC_CATEGORY_BY_ID.get(
    categoryFilter as SemanticCategoryId,
  );
  const selectedMode = MODES.find((option) => option.id === mode) ?? MODES[0];
  const scopedScores = useMemo(() => {
    if (!hydrated) return [];
    return selectedCategory
      ? listHighScores({
          mode: selectedMode.id,
          categoryId: selectedCategory.id,
        })
      : [];
  }, [selectedMode, selectedCategory, hydrated]);

  const unresolvedLegacy = useMemo(() => {
    if (!hydrated) return 0;
    return migrateLegacyHighScores().preservedCount;
  }, [hydrated]);

  function handleClose() {
    setShowClearConfirmation(false);
    onClose();
  }

  function handleConfirmClearAll() {
    const result = clearAllHighScores(true);
    setShowClearConfirmation(false);
    setAnnouncement(
      result.ok
        ? "All High Scores and recognized legacy score records were cleared."
        : "High Scores could not be cleared because browser storage is unavailable or invalid.",
    );
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="high-scores-title"
      aria-describedby="high-scores-description"
      onCancel={(event) => {
        event.preventDefault();
        handleClose();
      }}
      onClose={() => {
        if (open) handleClose();
      }}
      className="m-auto max-h-[min(90dvh,52rem)] w-[min(94vw,48rem)] overflow-y-auto border-2 border-white bg-[var(--surface-background)] p-0 text-[var(--foreground-primary)] shadow-[10px_10px_0_var(--accent-classic)] backdrop:bg-[#090719]/85 backdrop:backdrop-blur-sm"
    >
      <div className="p-5 sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Trophy
              aria-hidden="true"
              className="text-[var(--accent-highlight)]"
              size={22}
            />
            <div>
              <h2
                id="high-scores-title"
                className="text-xl font-bold uppercase tracking-[0.1em] sm:text-2xl"
              >
                High Scores
              </h2>
              <p
                id="high-scores-description"
                className="mt-1 text-xs text-[var(--foreground-muted)]"
              >
                Local best runs, kept separately by mode.
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleClose}
            aria-label="Close High Scores"
            className="inline-flex size-11 shrink-0 items-center justify-center border-2 border-white text-white transition-colors hover:bg-white/10"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <div
          className="mt-7 grid grid-cols-2 border-b-2 border-white"
          role="tablist"
          aria-label="High Score mode"
        >
          {MODES.map((option) => (
            <button
              key={option.id}
              id={`high-scores-tab-${option.id}`}
              type="button"
              role="tab"
              aria-selected={mode === option.id}
              aria-controls="high-scores-panel"
              onClick={() => setMode(option.id)}
              className={`min-h-12 border-x-2 border-t-2 border-white px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition-colors sm:text-sm ${mode === option.id ? "bg-[var(--accent-classic)] text-white" : "text-[var(--foreground-muted)] hover:bg-white/10"}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <section
          id="high-scores-panel"
          role="tabpanel"
          aria-labelledby={`high-scores-tab-${mode}`}
          className="mt-5"
        >
          <label className="mb-4 grid gap-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--foreground-muted)]">
            Filter by category
            <select
              aria-label="Filter by semantic category"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="min-h-11 w-full border-2 border-white bg-[var(--surface-background)] px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <option value="all">All categories</option>
              {SEMANTIC_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          {scores.length > 0 ? (
            <ol className="grid gap-3">
              {scores.map((record, index) => (
                <li
                  key={`${record.mode}:${record.categoryId}`}
                  className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-3 sm:px-4"
                >
                  <span className="grid size-7 place-items-center border border-white/50 text-xs font-bold text-[var(--accent-highlight)]">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold uppercase">
                      {record.category?.label}
                    </p>
                    <p className="mt-1 truncate text-[0.65rem] leading-relaxed text-[var(--foreground-muted)]">
                      {record.category?.metricDescription}
                    </p>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-[var(--accent-highlight)] sm:text-2xl">
                    {record.bestScore}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="border border-dashed border-[var(--border-mid)] px-5 py-10 text-center">
              <Trophy
                aria-hidden="true"
                className="mx-auto text-[var(--foreground-muted)]"
                size={28}
              />
              <p className="mt-4 text-sm font-bold uppercase">
                No {mode === "classic" ? "Classic" : "Time Attack"} scores yet
              </p>
              <p className="mt-2 text-xs text-[var(--foreground-muted)]">
                Complete a run in this mode to set a local best.
              </p>
            </div>
          )}
        </section>

        {unresolvedLegacy > 0 && (
          <p className="mt-4 text-xs leading-relaxed text-[var(--foreground-muted)]">
            {unresolvedLegacy} legacy score{" "}
            {unresolvedLegacy === 1 ? "record is" : "records are"} preserved but
            not assigned to a semantic category.
          </p>
        )}

        <div className="mt-7 border-t border-[var(--border-subtle)] pt-5">
          {categoryFilter !== "all" &&
            selectedCategory &&
            scopedScores.length > 0 && (
              <div className="mb-4">
                {!showLeaderboardConfirmation ? (
                  <button
                    type="button"
                    onClick={() => setShowLeaderboardConfirmation(true)}
                    className="min-h-11 border-2 border-[var(--status-error)] px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--status-error)] transition-colors hover:bg-[var(--status-error)]/10"
                  >
                    Clear this leaderboard
                  </button>
                ) : (
                  <div className="border-2 border-[var(--status-error)] p-4">
                    <p className="text-sm font-bold uppercase">
                      Clear this {selectedCategory?.label} leaderboard?
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
                      Only the selected mode and category score will be removed.
                      Unresolved legacy records are not assigned to this
                      leaderboard and will be preserved.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setShowLeaderboardConfirmation(false)}
                        className="min-h-11 border-2 border-white px-4 py-2 text-xs font-bold uppercase"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const result = clearLeaderboard({
                            mode: selectedMode.id,
                            categoryId: selectedCategory.id,
                          });
                          setShowLeaderboardConfirmation(false);
                          setCategoryFilter("all");
                          setAnnouncement(
                            result.ok
                              ? "The selected leaderboard was cleared."
                              : "The selected leaderboard could not be cleared.",
                          );
                        }}
                        className="min-h-11 border-2 border-white bg-[var(--status-error)] px-4 py-2 text-xs font-bold uppercase text-white"
                      >
                        Confirm clear
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

          {!showClearConfirmation ? (
            <button
              type="button"
              onClick={() => setShowClearConfirmation(true)}
              className="min-h-11 border-2 border-[var(--status-error)] px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--status-error)] transition-colors hover:bg-[var(--status-error)]/10"
            >
              Clear all High Scores
            </button>
          ) : (
            <div
              className="border-2 border-[var(--status-error)] p-4"
              aria-labelledby="clear-scores-title"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-[var(--status-error)]"
                  size={19}
                />
                <div>
                  <h3
                    id="clear-scores-title"
                    className="text-sm font-bold uppercase"
                  >
                    Clear all High Scores?
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--foreground-muted)]">
                    This removes every canonical score, recognized legacy score
                    record, and migration metadata. Unrelated browser data is
                    kept. This cannot be undone.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowClearConfirmation(false)}
                  className="min-h-11 border-2 border-white px-4 py-2 text-xs font-bold uppercase"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearAll}
                  className="min-h-11 border-2 border-white bg-[var(--status-error)] px-4 py-2 text-xs font-bold uppercase text-white"
                >
                  Confirm clear all
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </dialog>
  );
}
