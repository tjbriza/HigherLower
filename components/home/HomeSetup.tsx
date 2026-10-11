"use client";

import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import type {
  ProductionCatalogProjection,
  PublicProductionCategory,
} from "@/lib/catalog/availability";
import type {
  PlayableModeId,
  SemanticDomainId,
} from "@/lib/catalog/semanticCatalog";
import CategorySelector from "@/components/home/CategorySelector";
import DomainSelector, {
  type DomainOption,
} from "@/components/home/DomainSelector";
import ModeButton, { type SelectableMode } from "@/components/ModeButton";
import HighScoresModal from "@/components/HighScoresModal";

interface HomeSetupProps {
  catalog: ProductionCatalogProjection;
}

const MODES: readonly SelectableMode[] = [
  {
    id: "classic",
    label: "Classic",
    description: "Survive as long as you can. No clock, just skill.",
  },
  {
    id: "time-attack",
    label: "Time Attack",
    description: "Race the clock. Every right answer buys more time.",
  },
  {
    id: "pvp",
    label: "PvP",
    description: "Challenge another player. Coming soon.",
    comingSoon: true,
  },
];

/** Domain pre-selected on the initial visit so categories are visible immediately. */
const INITIAL_DOMAIN_ID: SemanticDomainId = "movies-series";

export default function HomeSetup({ catalog }: HomeSetupProps) {
  const router = useRouter();
  const [selectedDomainId, setSelectedDomainId] = useState<SemanticDomainId | null>(
    () =>
      catalog.domains.some((domain) => domain.id === INITIAL_DOMAIN_ID)
        ? INITIAL_DOMAIN_ID
        : null,
  );
  const [selectedCategory, setSelectedCategory] =
    useState<PublicProductionCategory | null>(null);
  const [selectedMode, setSelectedMode] = useState<PlayableModeId | null>(null);
  const [showScores, setShowScores] = useState(false);

  const domains = useMemo<DomainOption[]>(
    () =>
      catalog.domains.map((domain) => ({
        id: domain.id,
        label: domain.label,
        description: domain.description,
        categoryCount: domain.categories.length,
      })),
    [catalog.domains],
  );

  const activeDomain = catalog.domains.find(
    (domain) => domain.id === selectedDomainId,
  );
  const canPlay = Boolean(
    selectedCategory &&
    selectedCategory.playable &&
    selectedMode &&
    selectedCategory.compatibleModes.includes(selectedMode),
  );

  function selectDomain(domainId: SemanticDomainId) {
    setSelectedDomainId(domainId);
    setSelectedCategory(null);
  }

  function selectCategory(category: PublicProductionCategory) {
    setSelectedCategory(category);
    if (selectedMode && !category.compatibleModes.includes(selectedMode)) {
      setSelectedMode(null);
    }
  }

  function startGame() {
    if (!canPlay || !selectedCategory || !selectedMode) return;
    router.push(
      `/game/${selectedMode}?category=${encodeURIComponent(selectedCategory.id)}`,
    );
  }

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-x-hidden bg-grid px-[var(--space-page)]">
      <header className="absolute right-[var(--space-page)] top-5 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowScores(true)}
          aria-label="View High Scores"
          className="inline-flex min-h-11 items-center gap-2 border border-transparent px-3 text-xs text-[var(--foreground-muted)] hover:text-white focus-visible:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Trophy size={17} aria-hidden="true" />
          <span>High Scores</span>
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-[92rem] flex-col">
        {/* Hero — occupies the initial desktop viewport. The setup section
            must remain completely below the fold on load, so the hero owns
            the full viewport height and the following section carries the
            large Figma-derived break. */}
        <section className="flex min-h-dvh flex-col justify-center pt-24 pb-16 sm:pt-28 sm:pb-24">
          <div className="flex flex-col items-center">
            <h1
              aria-label="Higher or lower?"
              className="font-bold leading-[0.92] tracking-[-0.09em] text-[clamp(3.5rem,11.5vw,9.5rem)]"
            >
              <span className="block md:whitespace-nowrap">
                <span className="text-[var(--foreground-inverse)] [-webkit-text-stroke:2px_var(--border-strong)] [text-shadow:var(--hero-shadow-offset)_var(--hero-shadow-offset)_0_var(--accent-time-attack)]">
                  higher
                </span>
                <wbr />
                <span className="mx-[0.12em] text-[var(--foreground-inverse)] [-webkit-text-stroke:2px_var(--border-strong)] [text-shadow:var(--hero-shadow-offset)_var(--hero-shadow-offset)_0_var(--accent-action-higher)]">
                  or
                </span>
                <wbr />
                <span className="text-[var(--foreground-inverse)] [-webkit-text-stroke:2px_var(--border-strong)] [text-shadow:var(--hero-shadow-offset)_var(--hero-shadow-offset)_0_var(--accent-classic)]">
                  lower?
                </span>
              </span>
            </h1>
            {/* Supporting copy is associated with the title's right/end
                region rather than forming a two-column hero row. */}
            <p className="mt-4 w-full max-w-xs self-end text-right text-xs leading-relaxed text-[var(--foreground-muted)] sm:text-sm">
              the comparison game for students
              <br />
              {domains.length} domains,{" "}
              {domains.reduce((sum, domain) => sum + domain.categoryCount, 0)}{" "}
              categories, free
            </p>
          </div>
        </section>

        {/* Setup — begins below the fold and requires scrolling. */}
        <DomainSelector
          domains={domains}
          selectedDomainId={selectedDomainId}
          onSelect={selectDomain}
        />

        <CategorySelector
          categories={activeDomain?.categories ?? []}
          selectedCategoryId={selectedCategory?.id ?? null}
          onSelect={selectCategory}
        />

        <section
          aria-labelledby="mode-selector-heading"
          className="pt-[var(--space-section)]"
        >
          <h2
            id="mode-selector-heading"
            className="font-bold text-4xl sm:text-5xl mb-8"
          >
            How do you want to play?
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MODES.map((mode) => {
              const compatible =
                !selectedCategory ||
                mode.id === "pvp" ||
                selectedCategory.compatibleModes.includes(mode.id);
              const playableMode = mode.id === "pvp" ? null : mode.id;
              return (
                <ModeButton
                  key={mode.id}
                  mode={mode}
                  selected={selectedMode === playableMode}
                  disabled={!compatible}
                  onSelect={() => playableMode && setSelectedMode(playableMode)}
                />
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="ready-heading"
          className="flex flex-col items-center gap-4 pt-[var(--space-section)] pb-24 text-center sm:pb-32"
        >
          <h2 id="ready-heading" className="text-4xl font-bold sm:text-5xl">
            Ready?
          </h2>
          <button
            type="button"
            onClick={startGame}
            disabled={!canPlay}
            className="home-go relative grid size-36 place-items-center rounded-full border-2 border-white bg-[var(--accent-time-attack)] text-xl font-bold text-[#121212] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:border-white/60 disabled:bg-[var(--bg-elevated)] disabled:text-[var(--text-muted)] sm:size-44"
          >
            <span className="pointer-events-none absolute inset-[3px] rounded-full border-2 border-white" />
            <span
              aria-hidden="true"
              className="absolute -bottom-2 -right-2 -z-10 size-full rounded-full bg-[#838cf3]"
            />
            <span className="relative z-10">go!</span>
          </button>
          {!canPlay && (
            <p className="max-w-sm text-xs text-[var(--foreground-muted)]">
              {domains.length === 0
                ? "Comparison categories are temporarily unavailable while their data sources are being verified."
                : "Select an available category and game mode to play. Categories marked Unavailable are not playable yet."}
            </p>
          )}
        </section>
      </div>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] py-4 text-[0.65rem] text-[var(--foreground-muted)]">
        <span>© {new Date().getFullYear()} Higher or Lower</span>
        <span>More categories coming soon</span>
      </footer>

      <HighScoresModal open={showScores} onClose={() => setShowScores(false)} />
    </main>
  );
}
