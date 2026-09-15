"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Play, ChevronRight } from "lucide-react";
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
      <nav className="relative z-20 flex items-center justify-between px-5 sm:px-8 py-4 border-b border-white/[0.08]"
        style={{ background: "rgba(10,15,26,0.95)", backdropFilter: "blur(12px)" }}
      >
        {/* Wordmark */}
        <span
          className="text-lg font-black tracking-tight text-white"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.03em" }}
        >
          HIGHER<span className="text-[var(--brand-primary)]">/</span>LOWER
        </span>

        {/* Nav right */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 mr-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] animate-pulse" />
            Live
          </div>

          <button
            id="btn-high-scores"
            onClick={() => setShowScores(true)}
            aria-label="View best scores"
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold
                       border border-white/10 text-slate-300
                       hover:border-[var(--brand-gold)] hover:text-[var(--brand-gold)]
                       transition-all duration-200 cursor-pointer bg-white/[0.03]"
          >
            <Trophy size={14} strokeWidth={2} />
            <span className="hidden sm:inline">Best Scores</span>
          </button>
        </div>
      </nav>

      {/* ── Main content — two columns on large screens ──────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row">

        {/* LEFT — editorial headline */}
        <div className="relative flex flex-col justify-center
                        items-center text-center
                        lg:items-start lg:text-left
                        px-6 sm:px-10 lg:px-16 py-12 lg:py-0 lg:w-[52%]
                        bg-[var(--bg-base)]">

          {/* Diagonal stripe decoration */}
          <div className="absolute inset-y-0 right-0 w-48 stripe-accent opacity-40 pointer-events-none hidden lg:block" />

          {/* Badge */}
          <p className="section-label mb-6">The Comparison Game</p>

          {/* Headline — preserved as-is per user request */}
          <h1
            className="leading-none font-black tracking-tight text-white mb-6"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "clamp(3.2rem, 7.5vw, 6rem)",
              lineHeight: 0.92,
            }}
          >
            IS IT<br />
            <span className="text-gradient">HIGHER</span><br />
            <span className="text-white/15">———</span><br />
            OR<br />
            <span className="text-gradient">LOWER?</span>
          </h1>

          <p className="text-base sm:text-lg text-slate-400 max-w-md leading-relaxed mb-8">
            Pick a category. Pick a mode. Guess whether the next card ranks{" "}
            <strong className="text-white font-semibold">higher</strong> or{" "}
            <strong className="text-white font-semibold">lower</strong> — and see how far you can go.
          </p>

          {/* Stats strip */}
          <div className="flex items-center gap-8">
            {[
              { value: "4",  label: "Categories" },
              { value: "∞",  label: "Cards" },
              { value: "Free", label: "Always" },
            ].map(({ value, label }) => (
              <div key={label}>
                <p
                  className="text-2xl font-black text-white leading-none"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  {value}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 mt-0.5">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — game setup panel */}
        <div
          className="flex flex-col justify-center px-5 sm:px-8 lg:px-10 py-8 lg:py-10
                     lg:w-[48%] lg:border-l border-t lg:border-t-0 border-white/[0.08]
                     overflow-y-auto"
          style={{ background: "#0d1525" }}
        >

          {/* ①  Category */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span
                className="flex items-center justify-center w-5 h-5 rounded text-[11px] font-black text-[var(--bg-base)]"
                style={{ background: "var(--brand-primary)", fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                1
              </span>
              <p className="section-label" style={{ color: "var(--brand-primary)" }}>Pick a Category</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <span
                className="flex items-center justify-center w-5 h-5 rounded text-[11px] font-black text-[var(--bg-base)]"
                style={{ background: "var(--brand-primary)", fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                2
              </span>
              <p className="section-label" style={{ color: "var(--brand-primary)" }}>Choose a Mode</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
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
                flex items-center justify-center gap-3
                ${canPlay
                  ? "btn-gold hover:scale-[1.02] active:scale-100"
                  : "bg-[#1c2433] text-slate-600 cursor-not-allowed border border-white/[0.06]"
                }
              `}
              style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.2rem", letterSpacing: "0.06em" }}
            >
              {canPlay ? (
                <>
                  <Play size={18} strokeWidth={2.5} />
                  LET'S PLAY
                  <ChevronRight size={18} strokeWidth={2.5} />
                </>
              ) : (
                "SELECT A CATEGORY & MODE"
              )}
            </button>

            {!canPlay && (
              <p className="mt-2.5 text-center text-xs text-slate-600">
                {!selectedCategory && !selectedMode
                  ? "Choose both a category and a game mode above"
                  : !selectedCategory
                  ? "Now pick a category ↑"
                  : "Now pick a game mode ↑"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="relative z-10 px-5 sm:px-8 py-4 border-t border-white/[0.06] flex items-center justify-between"
        style={{ background: "rgba(10,15,26,0.95)" }}
      >
        <p className="text-xs text-slate-600">© {new Date().getFullYear()} Higher or Lower</p>
        <p className="text-xs text-slate-600">More categories coming soon</p>
      </footer>

      {/* ── High Scores modal ────────────────────────────────────────────── */}
      <HighScoresModal open={showScores} onClose={() => setShowScores(false)} />
    </main>
  );
}
