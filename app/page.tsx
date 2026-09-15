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
    <main className="relative flex-1 flex flex-col min-h-dvh overflow-x-hidden">

      {/* ── Top nav bar ─────────────────────────────────────────────────── */}
      <nav className="relative z-20 flex items-center justify-between px-6 sm:px-10 py-5 border-b border-white/[0.06]">
        {/* Wordmark */}
        <div className="flex items-center gap-3">
          <span
            className="text-xl font-black tracking-tight text-white"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.02em" }}
          >
            HIGHER<span className="text-[var(--brand-primary)]">/</span>LOWER
          </span>
        </div>

        {/* Nav right */}
        <div className="flex items-center gap-3">
          {/* Live badge */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] animate-pulse" />
            Live
          </div>

          {/* High Scores */}
          <button
            id="btn-high-scores"
            onClick={() => setShowScores(true)}
            aria-label="View best scores"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                       border border-[var(--border-mid)] text-[var(--text-secondary)]
                       hover:border-[var(--brand-gold)] hover:text-[var(--brand-gold)]
                       transition-all duration-200 cursor-pointer"
          >
            <span>🏆</span>
            <span className="hidden sm:inline">Best Scores</span>
          </button>
        </div>
      </nav>

      {/* ── Hero section ────────────────────────────────────────────────── */}
      <section className="relative z-10 flex-1 flex flex-col lg:flex-row">

        {/* LEFT — title + description */}
        <div className="relative flex flex-col justify-center px-6 sm:px-10 lg:px-16 py-14 lg:py-0 lg:w-[52%]">

          {/* Decorative stripe behind the headline */}
          <div
            className="absolute inset-y-0 right-0 w-1/2 stripe-accent opacity-50 pointer-events-none hidden lg:block"
          />

          {/* Category badge */}
          <p className="section-label mb-5">The Comparison Game</p>

          {/* Main headline */}
          <h1
            className="leading-none font-black tracking-tight text-white mb-6"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "clamp(3.5rem, 8vw, 6.5rem)",
              lineHeight: 0.92,
            }}
          >
            IS IT<br />
            <span className="text-gradient">HIGHER</span><br />
            <span className="text-white/20">———</span><br />
            OR<br />
            <span className="text-gradient">LOWER?</span>
          </h1>

          <p
            className="text-base sm:text-lg text-[var(--text-secondary)] max-w-md leading-relaxed mb-8"
            style={{ fontWeight: 400 }}
          >
            Pick a category. Pick a mode. Guess whether the next card ranks{" "}
            <strong className="text-white font-semibold">higher</strong> or{" "}
            <strong className="text-white font-semibold">lower</strong> — and see how
            far you can go without a single wrong answer.
          </p>

          {/* Stats strip */}
          <div className="flex items-center gap-6">
            {[
              { value: "4", label: "Categories" },
              { value: "∞", label: "Cards" },
              { value: "0", label: "Cost" },
            ].map(({ value, label }) => (
              <div key={label} className="text-center">
                <p
                  className="text-3xl font-black text-white leading-none"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  {value}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mt-0.5">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — game setup panel */}
        <div className="flex flex-col justify-center px-6 sm:px-10 lg:px-12 py-10 lg:py-12 lg:w-[48%] bg-[var(--bg-surface)] border-t lg:border-t-0 lg:border-l border-white/[0.06]">

          {/* ①  Category */}
          <div className="mb-7">
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

          {/* ②  Mode */}
          <div className="mb-7">
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

          {/* ③  Play */}
          <div>
            <button
              id="play-button"
              onClick={handlePlay}
              disabled={!canPlay}
              aria-label="Start the game"
              className={`
                w-full py-4 rounded-xl font-black tracking-wide transition-all duration-200
                text-lg
                ${canPlay
                  ? "btn-gold hover:scale-[1.02] active:scale-100"
                  : "bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed border border-white/[0.06]"
                }
              `}
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.25rem" }}
            >
              {canPlay ? "▶  LET'S PLAY" : "SELECT A CATEGORY & MODE"}
            </button>

            {!canPlay && (
              <p className="mt-2.5 text-center text-xs text-[var(--text-muted)]">
                {!selectedCategory && !selectedMode
                  ? "Choose both a category and a game mode above"
                  : !selectedCategory
                  ? "Now pick a category ↑"
                  : "Now pick a game mode ↑"}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="relative z-10 px-6 sm:px-10 py-5 border-t border-white/[0.06] flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          © {new Date().getFullYear()} Higher or Lower
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          More categories coming soon
        </p>
      </footer>

      {/* ── High Scores modal ────────────────────────────────────────────── */}
      <HighScoresModal open={showScores} onClose={() => setShowScores(false)} />
    </main>
  );
}
