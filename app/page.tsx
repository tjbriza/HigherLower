"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import CategoryCard from "@/components/CategoryCard";
import ModeButton from "@/components/ModeButton";
import HighScoresModal from "@/components/HighScoresModal";
import { CATEGORIES, GAME_MODES, type CategoryId, type GameModeId } from "@/types/game";

export default function HomePage() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(null);
  const [selectedMode, setSelectedMode] = useState<GameModeId | null>(null);
  const [showScores, setShowScores] = useState(false);

  const canPlay = selectedCategory !== null && selectedMode !== null;

  function handlePlay() {
    if (!canPlay) return;
    router.push(`/game/${selectedMode}?category=${selectedCategory}`);
  }

  return (
    <main className="relative flex-1 flex flex-col items-center justify-start min-h-dvh px-4 py-12 sm:py-16 overflow-hidden">
      {/* ── Ambient orbs ───────────────────────────────────────────────── */}
      <div
        className="orb w-[500px] h-[500px] bg-[var(--brand-primary)] opacity-[0.08] -top-32 -left-32"
        style={{ animationDelay: "0s" }}
      />
      <div
        className="orb w-[400px] h-[400px] bg-[var(--brand-secondary)] opacity-[0.07] top-1/2 -right-40"
        style={{ animationDelay: "-6s" }}
      />
      <div
        className="orb w-[300px] h-[300px] bg-[var(--brand-teal)] opacity-[0.06] bottom-10 left-1/4"
        style={{ animationDelay: "-12s" }}
      />

      {/* ── Hero header ────────────────────────────────────────────────── */}
      <header className="relative z-10 text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 glass border border-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-teal)] animate-pulse" />
            <span className="section-label text-[var(--brand-teal)]">Live &amp; Ready</span>
          </div>

          {/* Trophy / High Scores button */}
          <button
            id="btn-high-scores"
            onClick={() => setShowScores(true)}
            aria-label="View high scores"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5
                       glass border border-white/10 text-[var(--brand-gold)]
                       hover:border-[var(--brand-gold)]/40 hover:bg-[var(--brand-gold)]/5
                       transition-all duration-200 cursor-pointer"
          >
            <span className="text-base">🏆</span>
            <span className="section-label text-[var(--brand-gold)]">Best Scores</span>
          </button>
        </div>

        <h1 className="text-5xl sm:text-7xl font-black tracking-tight leading-none mb-4">
          <span className="block text-[var(--text-primary)]">Higher</span>
          <span className="block text-gradient">or Lower</span>
        </h1>

        <p className="mt-4 max-w-md mx-auto text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed">
          Pick a category. Choose your mode. Guess whether the next card is{" "}
          <strong className="text-[var(--text-primary)] font-semibold">higher</strong> or{" "}
          <strong className="text-[var(--text-primary)] font-semibold">lower</strong> — and see how
          far you can go.
        </p>
      </header>

      {/* ── Setup panel ────────────────────────────────────────────────── */}
      <section className="relative z-10 w-full max-w-2xl space-y-8">

        {/* Category selection */}
        <div>
          <p className="section-label mb-4">① Pick a Category</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CATEGORIES.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                selected={selectedCategory === cat.id}
                onClick={() =>
                  setSelectedCategory((prev) => (prev === cat.id ? null : cat.id))
                }
              />
            ))}
          </div>
        </div>

        {/* Mode selection */}
        <div>
          <p className="section-label mb-4">② Choose a Mode</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {GAME_MODES.map((mode) => (
              <ModeButton
                key={mode.id}
                mode={mode}
                selected={selectedMode === mode.id}
                onClick={() =>
                  setSelectedMode((prev) => (prev === mode.id ? null : mode.id))
                }
              />
            ))}
          </div>
        </div>

        {/* Play CTA */}
        <div className="pt-2">
          <button
            id="play-button"
            onClick={handlePlay}
            disabled={!canPlay}
            aria-label="Start the game"
            className={`
              w-full py-4 rounded-2xl text-base font-bold tracking-wide
              transition-all duration-300
              ${
                canPlay
                  ? "btn-gold shadow-[0_0_40px_rgba(245,200,66,0.25)] hover:shadow-[0_0_60px_rgba(245,200,66,0.4)]"
                  : "bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed border border-white/[0.06]"
              }
            `}
          >
            {canPlay ? (
              <span className="flex items-center justify-center gap-2">
                <span>Let&apos;s Play</span>
                <span className="text-lg">🚀</span>
              </span>
            ) : (
                "Select a category & mode to begin"
            )}
          </button>

          {/* Hint text */}
          {!canPlay && (
            <p className="mt-3 text-center text-xs text-[var(--text-muted)]">
              {!selectedCategory && !selectedMode
                ? "Choose a category and a game mode above"
                : !selectedCategory
                ? "Now pick a category ↑"
                : "Now pick a game mode ↑"}
            </p>
          )}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="relative z-10 mt-16 text-center">
        <p className="text-xs text-[var(--text-muted)]">
          Higher or Lower &copy; {new Date().getFullYear()} &middot; More categories coming soon
        </p>
      </footer>

      {/* ── High Scores modal ───────────────────────────────────────────── */}
      <HighScoresModal open={showScores} onClose={() => setShowScores(false)} />
    </main>
  );
}
