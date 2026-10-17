"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDown, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
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
  const prefersReducedMotion = useReducedMotion();
  const setupRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const [setupArrived, setSetupArrived] = useState(false);
  const initialDomain = catalog.domains.find((domain) => domain.id === INITIAL_DOMAIN_ID)
    ?? catalog.domains[0];
  const [selectedDomainId, setSelectedDomainId] = useState<SemanticDomainId | null>(
    () => initialDomain?.id ?? null,
  );
  const [selectedCategory, setSelectedCategory] =
    useState<PublicProductionCategory | null>(() =>
      initialDomain?.categories.find((category) => category.playable) ?? null,
    );
  const [selectedMode, setSelectedMode] = useState<PlayableModeId | null>(() => {
    const category = initialDomain?.categories.find((item) => item.playable);
    if (!category) return null;
    return category.compatibleModes.includes("classic")
      ? "classic"
      : category.compatibleModes[0] ?? null;
  });
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
    const nextDomain = catalog.domains.find((domain) => domain.id === domainId);
    const nextCategory = nextDomain?.categories.find((category) => category.playable) ?? null;
    setSelectedDomainId(domainId);
    setSelectedCategory(nextCategory);
    if (!nextCategory || (selectedMode && !nextCategory.compatibleModes.includes(selectedMode))) {
      setSelectedMode(
        nextCategory?.compatibleModes.includes("classic")
          ? "classic"
          : nextCategory?.compatibleModes[0] ?? null,
      );
    }
  }

  function selectCategory(category: PublicProductionCategory) {
    setSelectedCategory(category);
    if (!selectedMode || !category.compatibleModes.includes(selectedMode)) {
      setSelectedMode(
        category.compatibleModes.includes("classic")
          ? "classic"
          : category.compatibleModes[0] ?? null,
      );
    }
  }

  function startGame() {
    if (!canPlay || !selectedCategory || !selectedMode) return;
    router.push(
      `/game/${selectedMode}?category=${encodeURIComponent(selectedCategory.id)}`,
    );
  }

  const heroEntrance = prefersReducedMotion
    ? { initial: false as const, animate: "visible" as const }
    : { initial: "hidden" as const, animate: "visible" as const };
  const heroVariants = {
    hidden: {},
    visible: {
      transition: {
        when: "beforeChildren" as const,
        staggerChildren: 0.06,
      },
    },
  };
  const heroChildVariants = {
    hidden: { opacity: 0, transform: "translateY(8px)" },
    visible: {
      opacity: 1,
      transform: "translateY(0px)",
      transition: { duration: prefersReducedMotion ? 0.01 : 0.24, ease: [0.23, 1, 0.32, 1] as const },
    },
  };

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-x-clip bg-grid px-[var(--space-page)]">
      <header className="absolute right-[var(--space-page)] top-5 z-10 flex items-center gap-2">
        <button
          ref={openerRef}
          type="button"
          onClick={() => setShowScores(true)}
          aria-label="View High Scores"
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 border border-transparent px-3 text-xs text-[var(--foreground-muted)] transition-colors hover:bg-white/10 hover:text-white active:bg-white/15 focus-visible:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Trophy size={17} aria-hidden="true" />
          <span>High Scores</span>
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-[92rem] flex-col">
        {/* Hero — full-screen on load; setup remains a separate long-form section. */}
        <section className="flex min-h-dvh flex-col justify-center pt-24 pb-16 sm:pt-28 sm:pb-24">
          <motion.div className="flex flex-col items-center" variants={heroVariants} {...heroEntrance}>
            <motion.h1
              aria-label="Higher or lower?"
              className="font-bold leading-[0.92] tracking-[-0.09em] text-[clamp(3.5rem,11.5vw,9.5rem)]"
              variants={heroChildVariants}
            >
              <span className="block md:whitespace-nowrap">
                <span className="text-[var(--foreground-inverse)] [-webkit-text-stroke:2px_var(--border-strong)] [text-shadow:var(--hero-shadow-offset)_var(--hero-shadow-offset)_0_var(--accent-time-attack)]">higher</span><wbr />
                <span className="mx-[0.12em] text-[var(--foreground-inverse)] [-webkit-text-stroke:2px_var(--border-strong)] [text-shadow:var(--hero-shadow-offset)_var(--hero-shadow-offset)_0_var(--accent-action-higher)]">or</span><wbr />
                <span className="text-[var(--foreground-inverse)] [-webkit-text-stroke:2px_var(--border-strong)] [text-shadow:var(--hero-shadow-offset)_var(--hero-shadow-offset)_0_var(--accent-classic)]">lower?</span>
              </span>
            </motion.h1>
            <motion.p
              className="mt-4 w-full max-w-xs self-end text-right text-xs leading-relaxed text-[var(--foreground-muted)] sm:text-sm"
              variants={heroChildVariants}
            >
              the comparison game for students
              <br />
              {domains.length} domains, {domains.reduce((sum, domain) => sum + domain.categoryCount, 0)} categories, free
            </motion.p>
            <motion.a
              href="#setup"
              onClick={(event) => {
                event.preventDefault();
                setSetupArrived(true);
                setupRef.current?.scrollIntoView({
                  behavior: prefersReducedMotion ? "instant" : "smooth",
                  block: "start",
                });
              }}
              aria-label="Start Comparing"
              className="group mt-8 inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--accent-time-attack)]/70 bg-[var(--accent-time-attack)]/10 px-5 py-2 text-sm font-bold text-white transition-[background-color,border-color,color,transform] duration-150 ease-out hover:border-[var(--accent-time-attack)] hover:bg-[var(--accent-time-attack)]/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
              variants={heroChildVariants}
            >
              <span>Start Comparing</span>
              <ArrowDown aria-hidden="true" size={16} className="transition-transform duration-150 ease-out group-hover:translate-y-2" />
            </motion.a>
          </motion.div>
        </section>

        {/* Setup — the only explicit in-page navigation destination. */}
        <div ref={setupRef} id="setup" className="scroll-mt-4">
          <motion.div
            initial={false}
            animate={setupArrived && !prefersReducedMotion
              ? { opacity: [0.88, 1], transform: ["translateY(6px)", "translateY(0px)"] }
              : { opacity: 1, transform: "translateY(0px)" }}
            transition={{ duration: prefersReducedMotion ? 0.01 : 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <DomainSelector
              domains={domains}
              selectedDomainId={selectedDomainId}
              onSelect={selectDomain}
            />
          </motion.div>

          <CategorySelector
            categories={activeDomain?.categories ?? []}
            selectedCategoryId={selectedCategory?.id ?? null}
            onSelect={selectCategory}
          />
        </div>

        <section
          aria-labelledby="mode-selector-heading"
          className="pt-[var(--space-section-tight)]"
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
          className="flex flex-col items-center gap-4 pt-[clamp(2.5rem,6vw,5rem)] pb-24 text-center sm:pb-32"
        >
          <h2 id="ready-heading" className="text-4xl font-bold sm:text-5xl">
            Ready?
          </h2>
          <button
            type="button"
            onClick={startGame}
            disabled={!canPlay}
            className="home-go relative isolate grid size-36 cursor-pointer place-items-center rounded-full bg-[var(--accent-time-attack)] text-2xl font-bold text-[#121212] transition-[background-color,transform,border-color] duration-150 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:bg-[var(--bg-elevated)] disabled:text-[var(--text-muted)] sm:size-44 sm:text-3xl"
          >
            <span
              aria-hidden="true"
              className="home-go-offset absolute -bottom-2 -right-2 -z-10 size-full rounded-full bg-[#838cf3] transition-transform duration-150 ease-out"
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

      <HighScoresModal
        open={showScores}
        onClose={() => setShowScores(false)}
        openerRef={openerRef}
      />
    </main>
  );
}
