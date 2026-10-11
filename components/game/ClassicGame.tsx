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

import {
  useEffect,
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GameItem } from "@/types/api";
import type { SemanticCategoryId } from "@/types/game";
import GameCard from "@/components/game/GameCard";
import GameplayShell from "@/components/game/GameplayShell";
import ComparisonBoard from "@/components/game/ComparisonBoard";
import GameplayDivider from "@/components/game/GameplayDivider";
import DecisionControls from "@/components/game/DecisionControls";
import GameplayStatus from "@/components/game/GameplayStatus";
import DerivedGameState from "@/components/game/DerivedGameState";
import {
  readHighScore,
  subscribeHighScores,
  writeHighScore,
} from "@/lib/highScores/storage";

// ─── Types ────────────────────────────────────────────────────────────────────

type GamePhase = "playing" | "revealing" | "game-over";
type GuessDirection = "higher" | "lower";
type ResultTint = "correct" | "incorrect" | null;

interface ClassicGameProps {
  initialPool: GameItem[];
  categoryId: SemanticCategoryId;
  categoryLabel: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/**
 * Build a clean, tie-free deck from the server pool. The server already
 * shuffles the pool per request, so the initial deck preserves that order to
 * keep server and client render identical (avoids a hydration mismatch).
 * `shuffleDeck` is used for explicit re-shuffles such as "Play again".
 */
function buildDeck(pool: GameItem[]): GameItem[] {
  return dedupeAdjacentEquals(
    pool.filter((item) => !!item.imageUrl && !!item.name),
  );
}

/** Shuffle a pool into a fresh deck (used for explicit restarts). */
function shuffleDeck(pool: GameItem[]): GameItem[] {
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
  const [tint, setTint] = useState<ResultTint>(null);
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null);

  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getHighScoreSnapshot = useCallback(
    () => readHighScore({ mode: "classic", categoryId }),
    [categoryId],
  );
  const highScore = useSyncExternalStore(
    subscribeHighScores,
    getHighScoreSnapshot,
    () => 0,
  );

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
            writeHighScore({ mode: "classic", categoryId }, score);
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
    setDeck(shuffleDeck(initialPool));
    setSpent([]);
    setScore(0);
    setPhase("playing");
    setTint(null);
    setLastCorrect(null);
  }

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!currentItem || !nextItem) {
    return (
      <GameplayShell mode="classic" title={`${categoryLabel} · Classic`}>
        <DerivedGameState kind="empty" />
      </GameplayShell>
    );
  }

  return (
    <GameplayShell
      mode="classic"
      title={`${categoryLabel} · Classic`}
      status={
        <div className="flex items-center gap-11">
          <GameplayStatus value={score} label="Score" />
          {highScore > 0 && <GameplayStatus value={highScore} label="Best" />}
        </div>
      }
    >
      <div className="relative flex min-h-0 flex-1 flex-col">
        <GameplayDivider />

        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none absolute inset-x-0 top-3 z-30 text-center text-xs font-bold uppercase tracking-[0.18em] transition-opacity ${phase === "revealing" && lastCorrect !== null ? "opacity-100" : "opacity-0"}`}
        >
          {lastCorrect ? "Correct" : "Incorrect"}
        </div>

        <ComparisonBoard
          current={
            <GameCard
              key={currentItem.id}
              item={currentItem}
              revealed
              side="current"
              resultTint={phase === "revealing" ? tint : null}
              mode="classic"
            />
          }
          next={
            <GameCard
              key={nextItem.id}
              item={nextItem}
              revealed={phase === "revealing"}
              side="next"
              resultTint={phase === "revealing" ? tint : null}
              mode="classic"
            />
          }
        />

        {phase !== "game-over" && (
          <DecisionControls
            onHigher={() => handleGuess("higher")}
            onLower={() => handleGuess("lower")}
            disabled={phase !== "playing"}
            className="relative z-30 px-4 pb-8 md:ml-auto md:mr-0 md:w-1/2 md:px-0 md:pr-6 lg:pr-10"
          />
        )}
      </div>

      {/* ── Game Over modal ─────────────────────────────────────────────── */}
      {phase === "game-over" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="classic-game-over-title"
          className="absolute inset-0 z-50 flex items-center justify-center bg-[#15122b]/90 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md border-2 border-white bg-[var(--surface-raised)] p-7 text-center shadow-[8px_8px_0_var(--accent-classic)]">
            <h2
              id="classic-game-over-title"
              className="mb-3 text-2xl font-bold uppercase text-[var(--status-error)]"
            >
              Game over
            </h2>
            <p className="mb-6 text-sm text-[var(--foreground-muted)]">
              <span className="font-bold text-white">{nextItem.name}</span> was{" "}
              <span className="font-bold text-[var(--accent-highlight)]">
                {nextItem.displayValue}
              </span>
            </p>

            <div className="mb-6 flex justify-center gap-10">
              <GameplayStatus value={score} label="Score" />
              <GameplayStatus
                value={Math.max(score, highScore)}
                label={score > highScore ? "New best" : "Best"}
              />
            </div>

            <div className="flex flex-col gap-3">
              <button
                id="btn-play-again"
                onClick={handlePlayAgain}
                className="min-h-12 border-2 border-white bg-[var(--accent-highlight)] px-5 py-3 font-bold uppercase text-[#15122b] shadow-[5px_5px_0_#ffffff] transition-transform hover:-translate-y-1"
              >
                Play again
              </button>
              <Link
                href="/"
                id="btn-back-to-menu"
                className="flex min-h-12 items-center justify-center gap-2 border-2 border-white px-5 py-3 text-sm font-bold uppercase text-white transition-colors hover:bg-white/10"
              >
                <ArrowLeft size={14} strokeWidth={2} />
                Back to setup
              </Link>
            </div>
          </div>
        </div>
      )}
    </GameplayShell>
  );
}
