/**
 * ClassicGame — client-side game logic for Classic Mode.
 *
 * Deck system:
 *   - `deck` is the ordered queue of items not yet shown this round.
 *   - `currentItem` and `nextItem` are always the first two from the deck.
 *   - On a correct guess the deck pointer advances by 1 (currentItem consumed).
 *   - When the deck has only 1 item left (no nextItem possible), the spent
 *     items are reshuffled and appended so the game never runs out of cards.
 *   - An item NEVER appears twice in the same uninterrupted stretch because we
 *     only reshuffle the spent items, not the active pair.
 */

"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { GameItem } from "@/types/api";
import { CategoryId } from "@/types/game";
import GameCard from "@/components/game/GameCard";
import HighScoresModal from "@/components/HighScoresModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type GamePhase = "playing" | "revealing" | "game-over";
type GuessDirection = "higher" | "lower";
type ResultTint = "correct" | "incorrect" | null;

interface ClassicGameProps {
  initialPool: GameItem[];
  categoryId: CategoryId;
  categoryLabel: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LS_KEY = (cat: string) => `hl-highscore-classic-${cat}`;

function getHighScore(categoryId: string): number {
  try {
    return parseInt(localStorage.getItem(LS_KEY(categoryId)) ?? "0", 10) || 0;
  } catch {
    return 0;
  }
}

function saveHighScore(categoryId: string, score: number): void {
  try {
    localStorage.setItem(LS_KEY(categoryId), String(score));
  } catch {
    /* localStorage unavailable (SSR / incognito) */
  }
}

/** Fisher-Yates shuffle — returns a NEW array */
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Scans a deck and ensures no two consecutive items share the same `value`.
 * When a duplicate pair is found at position [i, i+1], it looks forward for
 * the nearest item at j >= i+2 whose value differs and swaps [i+1] with [j].
 * If no swap candidate exists the pair is left as-is (tiny edge case in small
 * pools with many identical values).
 */
function dedupeAdjacentEquals(arr: GameItem[]): GameItem[] {
  const out = [...arr];
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].value === out[i + 1].value) {
      let j = i + 2;
      while (j < out.length && out[j].value === out[i].value) j++;
      if (j < out.length) {
        [out[i + 1], out[j]] = [out[j], out[i + 1]];
      }
    }
  }
  return out;
}

/** Build a clean, shuffled, tie-free deck from the server pool */
function buildDeck(pool: GameItem[]): GameItem[] {
  return dedupeAdjacentEquals(
    shuffle(pool.filter((item) => !!item.imageUrl && !!item.name)),
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClassicGame({
  initialPool,
  categoryId,
  categoryLabel,
}: ClassicGameProps) {
  const [deck, setDeck] = useState<GameItem[]>(() => buildDeck(initialPool));
  const [spent, setSpent] = useState<GameItem[]>([]);

  const currentItem = deck[0];
  const nextItem = deck[1];

  const [phase, setPhase] = useState<GamePhase>("playing");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [tint, setTint] = useState<ResultTint>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);
  const [showScores, setShowScores] = useState(false);

  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHighScore(getHighScore(categoryId));
  }, [categoryId]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  // ── Guess handler ──────────────────────────────────────────────────────────

  const handleGuess = useCallback(
    (direction: GuessDirection) => {
      if (phase !== "playing" || !nextItem) return;

      // Strict comparison: equal values are treated as wrong for both directions.
      // dedupeAdjacentEquals() prevents equal pairs from appearing, so this is
      // a safety net for any edge case that slips through.
      const isCorrect =
        direction === "higher"
          ? nextItem.value > currentItem.value
          : nextItem.value < currentItem.value;

      setPhase("revealing");
      setTint(isCorrect ? "correct" : "incorrect");
      setLastCorrect(isCorrect);

      revealTimerRef.current = setTimeout(() => {
        setTint(null);

        if (isCorrect) {
          const newScore = score + 1;
          setScore(newScore);

          const consumed = deck[0];
          const remaining = deck.slice(1);
          const newSpent = [...spent, consumed];

          if (remaining.length < 2) {
            // Reshuffle spent items and append; run dedup across the junction
            // so the last item in `remaining` and the first refill item are never equal.
            const refill = shuffle(newSpent);
            setDeck(dedupeAdjacentEquals([...remaining, ...refill]));
            setSpent([]);
          } else {
            setDeck(remaining);
            setSpent(newSpent);
          }

          setPhase("playing");
          setLastCorrect(null);
        } else {
          if (score > highScore) {
            setHighScore(score);
            saveHighScore(categoryId, score);
          }
          setPhase("game-over");
        }
      }, 1500);
    },
    [phase, nextItem, currentItem, score, highScore, deck, spent, categoryId],
  );

  // ── Keyboard support ───────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowUp" || e.key === "h") handleGuess("higher");
      if (e.key === "ArrowDown" || e.key === "l") handleGuess("lower");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleGuess]);

  // ── Play again ─────────────────────────────────────────────────────────────

  function handlePlayAgain() {
    setDeck(buildDeck(initialPool));
    setSpent([]);
    setScore(0);
    setPhase("playing");
    setTint(null);
    setLastCorrect(null);
  }

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!currentItem || !nextItem) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
        Not enough items to play. Try another category.
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">

      {/* ── Header bar (solid dark) ─────────────────────────────────────── */}
      <header
        className="flex-shrink-0 flex items-center justify-between px-4 py-3 z-40"
        style={{ background: "rgba(8,11,20,0.92)", backdropFilter: "blur(8px)" }}
      >
        {/* Back */}
        <Link
          href="/"
          className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/10
                     text-white/70 hover:text-white hover:bg-white/20 transition-colors"
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </Link>

        {/* Centre — category · mode · subtitle */}
        <div className="flex flex-col items-center text-center">
          <p
            className="text-sm font-black text-white leading-tight"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}
          >
            {categoryLabel} – Classic
          </p>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40"
          >
            Higher or Lower
          </p>
        </div>

        {/* Score + trophy */}
        <div className="flex items-center gap-2">
          {highScore > 0 && (
            <div className="text-right">
              <p className="text-base font-black text-[var(--brand-gold)] leading-none"
                 style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                {highScore}
              </p>
              <p className="text-[8px] text-white/30 uppercase tracking-widest">Best</p>
            </div>
          )}
          <div className="text-right">
            <p className="text-2xl font-black text-white leading-none"
               style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {score}
            </p>
            <p className="text-[8px] text-white/40 uppercase tracking-widest">Score</p>
          </div>
          <button
            onClick={() => setShowScores(true)}
            aria-label="View high scores"
            className="w-9 h-9 rounded-full bg-white/10 border border-white/10
                       flex items-center justify-center
                       text-white/50 hover:text-[var(--brand-gold)] hover:border-[var(--brand-gold)]/30
                       transition-colors cursor-pointer"
          >
            <Trophy size={15} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      {/* ── High Scores modal ──────────────────────────────────────────── */}
      <HighScoresModal open={showScores} onClose={() => setShowScores(false)} />

      {/* ── Correct / Incorrect flash banner ───────────────────────────── */}
      <div
        className={`
          absolute top-[64px] inset-x-0 z-50 flex justify-center pointer-events-none
          transition-all duration-300
          ${lastCorrect !== null && phase === "revealing"
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-3"
          }
        `}
      >
        <span
          className={`
            px-6 py-2 rounded-full text-sm font-black shadow-2xl tracking-wide
            ${lastCorrect ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}
          `}
          style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em" }}
        >
          {lastCorrect ? "✓  Correct!" : "✗  Wrong!"}
        </span>
      </div>

      {/* ── Split-screen game area ──────────────────────────────────────── */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* TOP / LEFT — current item */}
        <div className="flex-1 relative">
          <GameCard
            key={currentItem.id}
            item={currentItem}
            revealed
            side="current"
            resultTint={phase === "revealing" ? tint : null}
            thumbnailAspect={categoryId === "country-populations" ? "landscape" : "portrait"}
          />
        </div>

        {/* BOTTOM / RIGHT — next item + action buttons */}
        <div className="flex-1 relative">
          {/* Card: desktop renders buttons via children, mobile ignores them */}
          <GameCard
            key={nextItem.id}
            item={nextItem}
            revealed={phase === "revealing"}
            side="next"
            resultTint={phase === "revealing" ? tint : null}
            thumbnailAspect={categoryId === "country-populations" ? "landscape" : "portrait"}
          >
            {/* Desktop buttons — injected into GameCard’s centered content column */}
            {phase !== "game-over" && (
              <>
                <button
                  id="btn-higher-desktop"
                  onClick={() => handleGuess("higher")}
                  disabled={phase !== "playing"}
                  aria-label="Higher"
                  className={`
                    w-full py-4 rounded-full font-black tracking-wide
                    transition-all duration-150
                    ${phase === "playing"
                      ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/40 hover:scale-105 active:scale-95 cursor-pointer"
                      : "bg-white/10 text-white/20 cursor-not-allowed"
                    }
                  `}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.15rem", letterSpacing: "0.06em" }}
                >
                  ↑ Higher
                </button>
                <button
                  id="btn-lower-desktop"
                  onClick={() => handleGuess("lower")}
                  disabled={phase !== "playing"}
                  aria-label="Lower"
                  className={`
                    w-full py-4 rounded-full font-black tracking-wide
                    transition-all duration-150
                    ${phase === "playing"
                      ? "bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/40 hover:scale-105 active:scale-95 cursor-pointer"
                      : "bg-white/10 text-white/20 cursor-not-allowed"
                    }
                  `}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.15rem", letterSpacing: "0.06em" }}
                >
                  ↓ Lower
                </button>
              </>
            )}
          </GameCard>

          {/* Mobile buttons — absolutely centred, only visible on small screens */}
          {phase !== "game-over" && (
            <div className="md:hidden absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-8 pointer-events-none">
              <div className="flex flex-col gap-3 w-full max-w-[260px] pointer-events-auto">
                <button
                  id="btn-higher"
                  onClick={() => handleGuess("higher")}
                  disabled={phase !== "playing"}
                  aria-label="Higher"
                  className={`
                    w-full py-4 rounded-full font-black tracking-wide
                    transition-all duration-150
                    ${phase === "playing"
                      ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/40 hover:scale-105 active:scale-95 cursor-pointer"
                      : "bg-white/10 text-white/20 cursor-not-allowed"
                    }
                  `}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.2rem", letterSpacing: "0.06em" }}
                >
                  ↑ Higher
                </button>
                <button
                  id="btn-lower"
                  onClick={() => handleGuess("lower")}
                  disabled={phase !== "playing"}
                  aria-label="Lower"
                  className={`
                    w-full py-4 rounded-full font-black tracking-wide
                    transition-all duration-150
                    ${phase === "playing"
                      ? "bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/40 hover:scale-105 active:scale-95 cursor-pointer"
                      : "bg-white/10 text-white/20 cursor-not-allowed"
                    }
                  `}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.2rem", letterSpacing: "0.06em" }}
                >
                  ↓ Lower
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── OR badge — pinned to dead centre between the two halves ─────── */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none"
           style={{ marginTop: "24px" /* offset for header height */ }}>
        {/* Dividing line */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block w-px h-screen bg-white/10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden h-px w-screen bg-white/10" />
        <div className="relative w-14 h-14 rounded-full bg-white text-slate-900 font-black flex items-center justify-center text-base shadow-2xl border-4 border-slate-900 select-none"
             style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
          OR
        </div>
      </div>

      {/* ── Game Over modal ─────────────────────────────────────────────── */}
      {phase === "game-over" && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(8, 11, 20, 0.88)", backdropFilter: "blur(16px)" }}
        >
          <div
            className="rounded-2xl p-7 max-w-sm w-full text-center border border-white/10 shadow-2xl"
            style={{ background: "#111827", animation: "fadeInScale 0.3s ease both" }}
          >
            <p className="text-4xl mb-3 font-black text-rose-400"
               style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              GAME OVER
            </p>
            <p className="text-slate-400 text-sm mb-5">
              <span className="text-white font-semibold">{nextItem.name}</span> was{" "}
              <span className="text-amber-400 font-black">{nextItem.displayValue}</span>
            </p>

            {/* Score boxes */}
            <div className="flex gap-3 mb-6">
              <div className="flex-1 rounded-xl py-4 border border-white/[0.08]"
                   style={{ background: "#1c2433" }}>
                <p className="text-3xl font-black text-white leading-none"
                   style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{score}</p>
                <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Score</p>
              </div>
              <div className="flex-1 rounded-xl py-4 border border-white/[0.08]"
                   style={{ background: "#1c2433" }}>
                <p className={`text-3xl font-black leading-none ${score >= highScore && score > 0 ? "text-[var(--brand-gold)]" : "text-white"}`}
                   style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
                  {Math.max(score, highScore)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">
                  {score >= highScore && score > 0 ? "New Best!" : "Best"}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                id="btn-play-again"
                onClick={handlePlayAgain}
                className="btn-gold w-full py-3 rounded-xl font-black"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1.1rem", letterSpacing: "0.06em" }}
              >
                PLAY AGAIN
              </button>
              <Link
                href="/"
                id="btn-back-to-menu"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold
                           border border-white/[0.1] text-slate-400
                           hover:text-white hover:border-white/20 transition-colors"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}
              >
                <ArrowLeft size={14} strokeWidth={2} />
                BACK TO MENU
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Keyframe */}
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.93); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

