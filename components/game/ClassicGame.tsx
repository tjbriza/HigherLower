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
import { GameItem } from "@/types/api";
import { CategoryId } from "@/types/game";
import GameCard from "@/components/game/GameCard";

// ─── Types ────────────────────────────────────────────────────────────────────

type GamePhase = "playing" | "revealing" | "game-over";
type GuessDirection = "higher" | "lower";
type ResultTint = "correct" | "incorrect" | null;

interface ClassicGameProps {
  /** Full shuffled pool fetched server-side */
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

/** Fisher-Yates shuffle — returns a NEW array, never mutates in place */
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Build initial deck from the server-fetched pool.
 * Filters items with missing imageUrl before play begins.
 */
function buildDeck(pool: GameItem[]): GameItem[] {
  return shuffle(pool.filter((item) => !!item.imageUrl && !!item.name));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClassicGame({
  initialPool,
  categoryId,
  categoryLabel,
}: ClassicGameProps) {
  /**
   * `deck` is the ordered queue of upcoming items.
   * deck[0] = currentItem, deck[1] = nextItem.
   * When the player guesses correctly we shift deck[0] off and continue.
   * `spent` accumulates consumed items so we can reshuffle them back in.
   */
  const [deck, setDeck] = useState<GameItem[]>(() => buildDeck(initialPool));
  const [spent, setSpent] = useState<GameItem[]>([]);

  const currentItem = deck[0];
  const nextItem = deck[1];

  // UI state
  const [phase, setPhase] = useState<GamePhase>("playing");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [tint, setTint] = useState<ResultTint>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);

  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load high score from localStorage once mounted
  useEffect(() => {
    setHighScore(getHighScore(categoryId));
  }, [categoryId]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    };
  }, []);

  // ── Guess handler ──────────────────────────────────────────────────────────

  const handleGuess = useCallback(
    (direction: GuessDirection) => {
      if (phase !== "playing" || !nextItem) return;

      const isCorrect =
        direction === "higher"
          ? nextItem.value >= currentItem.value
          : nextItem.value <= currentItem.value;

      setPhase("revealing");
      setTint(isCorrect ? "correct" : "incorrect");
      setLastCorrect(isCorrect);

      revealTimerRef.current = setTimeout(() => {
        setTint(null);

        if (isCorrect) {
          const newScore = score + 1;
          setScore(newScore);

          // currentItem is now "spent" — remove it from the front of the deck
          const consumed = deck[0];
          const remaining = deck.slice(1); // deck[1] becomes new currentItem

          let newSpent = [...spent, consumed];

          // If we'd have fewer than 2 items in remaining, fold spent back in.
          // Exclude the new currentItem (remaining[0]) to avoid an instant repeat.
          if (remaining.length < 2) {
            const refill = shuffle(newSpent);
            setDeck([...remaining, ...refill]);
            setSpent([]);
          } else {
            setDeck(remaining);
            setSpent(newSpent);
          }

          setPhase("playing");
          setLastCorrect(null);
        } else {
          // Game over
          if (score > highScore) {
            setHighScore(score);
            saveHighScore(categoryId, score);
          }
          setPhase("game-over");
        }
      }, 1400);
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

  // ── Guard: pool too small ──────────────────────────────────────────────────

  if (!currentItem || !nextItem) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
        Not enough items to play. Try another category.
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex-1 flex flex-col min-h-dvh">

      {/* ── Score bar ──────────────────────────────────────────────────── */}
      <header className="relative z-20 flex items-center justify-between px-5 py-3 glass border-b border-white/[0.07]">
        <Link
          href="/"
          className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-white transition-colors text-sm"
        >
          <span className="text-lg">←</span>
          <span className="hidden sm:inline">Menu</span>
        </Link>

        <div className="text-center">
          <p className="section-label">{categoryLabel} — Classic</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            ↑ Higher &nbsp;·&nbsp; ↓ Lower
          </p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-black text-white leading-none">{score}</p>
          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
            Score
          </p>
        </div>
      </header>

      {/* ── Correct / incorrect flash banner ──────────────────────────── */}
      <div
        className={`
          absolute top-14 inset-x-0 z-30 flex justify-center pointer-events-none
          transition-all duration-300
          ${lastCorrect !== null && phase === "revealing" ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}
        `}
      >
        <span
          className={`
            px-5 py-2 rounded-full text-sm font-bold shadow-lg
            ${lastCorrect ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}
          `}
        >
          {lastCorrect ? "✓ Correct!" : "✗ Wrong!"}
        </span>
      </div>

      {/* ── Split-screen game area ─────────────────────────────────────── */}
      <main className="flex-1 flex flex-col md:flex-row">

        {/* LEFT / TOP — current item (revealed) */}
        <div className="flex-1 p-4 pb-2 md:pb-4 md:pr-2">
          <GameCard
            item={currentItem}
            revealed
            side="current"
            resultTint={null}
          />
        </div>

        {/* VS badge */}
        <div className="relative flex-shrink-0 flex items-center justify-center z-10
                        h-10 md:h-auto md:w-20">
          {/* Horizontal line on mobile, vertical on desktop */}
          <div className="absolute md:hidden inset-x-0 top-1/2 h-px bg-white/10" />
          <div className="absolute hidden md:block top-0 bottom-0 left-1/2 w-px bg-white/10" />

          <div className="relative flex items-center justify-center
                          w-14 h-14 rounded-full z-10
                          bg-[var(--bg-elevated)] border border-white/15
                          shadow-[0_0_30px_rgba(108,99,255,0.4)]">
            <span className="text-xs font-black text-gradient tracking-widest">VS</span>
          </div>
        </div>

        {/* RIGHT / BOTTOM — next item (hidden value) + action buttons */}
        <div className="flex-1 p-4 pt-2 md:pt-4 md:pl-2 flex flex-col gap-3">
          <div className="flex-1">
            <GameCard
              item={nextItem}
              revealed={phase === "revealing" || phase === "game-over"}
              side="next"
              resultTint={phase === "revealing" ? tint : null}
            />
          </div>

          {/* Higher / Lower buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              id="btn-higher"
              onClick={() => handleGuess("higher")}
              disabled={phase !== "playing"}
              aria-label="Higher"
              className={`
                flex flex-col items-center justify-center gap-1.5
                py-4 rounded-2xl font-bold text-sm
                transition-all duration-200
                ${
                  phase === "playing"
                    ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                    : "bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed"
                }
              `}
            >
              <span className="text-2xl">↑</span>
              <span>Higher</span>
            </button>

            <button
              id="btn-lower"
              onClick={() => handleGuess("lower")}
              disabled={phase !== "playing"}
              aria-label="Lower"
              className={`
                flex flex-col items-center justify-center gap-1.5
                py-4 rounded-2xl font-bold text-sm
                transition-all duration-200
                ${
                  phase === "playing"
                    ? "bg-gradient-to-br from-rose-500 to-orange-600 text-white shadow-lg shadow-rose-500/20 hover:shadow-rose-500/40 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                    : "bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed"
                }
              `}
            >
              <span className="text-2xl">↓</span>
              <span>Lower</span>
            </button>
          </div>
        </div>
      </main>

      {/* ── Game Over Modal ────────────────────────────────────────────── */}
      {phase === "game-over" && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center p-4"
          style={{ background: "rgba(8, 11, 20, 0.85)", backdropFilter: "blur(12px)" }}
        >
          <div className="glass rounded-3xl p-8 max-w-sm w-full text-center border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
            {/* Title */}
            <div className="text-5xl mb-4">💀</div>
            <h2 className="text-2xl font-black text-white mb-1 font-[family-name:var(--font-display)]">
              Game Over
            </h2>
            <p className="text-[var(--text-secondary)] text-sm mb-6">
              {nextItem.name} was{" "}
              <strong className="text-white">{nextItem.displayValue}</strong>
            </p>

            {/* Score display */}
            <div className="flex gap-4 mb-8">
              <div className="flex-1 glass rounded-2xl py-4 border border-white/[0.07]">
                <p className="text-3xl font-black text-gradient leading-none">{score}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-wider">
                  Score
                </p>
              </div>
              <div className="flex-1 glass rounded-2xl py-4 border border-white/[0.07]">
                <p
                  className={`text-3xl font-black leading-none ${
                    score >= highScore && score > 0 ? "text-[var(--brand-gold)]" : "text-white"
                  }`}
                >
                  {Math.max(score, highScore)}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-wider">
                  {score >= highScore && score > 0 ? "🏆 New Best!" : "Best"}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <button
                id="btn-play-again"
                onClick={handlePlayAgain}
                className="btn-gold w-full py-3 rounded-xl text-sm font-bold"
              >
                🔄 Play Again
              </button>
              <Link
                href="/"
                id="btn-back-to-menu"
                className="block w-full py-3 rounded-xl text-sm font-semibold
                           glass border border-white/[0.1] text-[var(--text-secondary)]
                           hover:text-white hover:border-white/20 transition-colors"
              >
                ← Back to Menu
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
