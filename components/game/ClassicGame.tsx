/**
 * ClassicGame — client-side game logic for Classic Mode.
 *
 * Deck system (remaining-pool model):
 *   - `deck` is the ordered queue of items not yet shown this cycle.
 *   - `currentItem` and `nextItem` are always the first two from the deck.
 *   - On a correct guess the deck pointer advances by 1 (currentItem consumed)
 *     and the consumed item's ID is recorded in `seenIds`.
 *   - An item ID cannot repeat until the whole available pool has been
 *     consumed. When fewer than 2 items remain, a new shuffled cycle is built
 *     from the full original pool, excluding the currently displayed item so
 *     it cannot immediately reappear across the cycle boundary.
 *   - Classic never ends because the pool was completed; it is endless.
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
import { buildDeck, buildNextCycle, shuffleDeck } from "@/lib/game/deck";

// ─── Types ────────────────────────────────────────────────────────────────────

type GamePhase = "playing" | "revealing" | "game-over";
type GuessDirection = "higher" | "lower";
type ResultTint = "correct" | "incorrect" | null;

interface ClassicGameProps {
  initialPool: GameItem[];
  categoryId: SemanticCategoryId;
  categoryLabel: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClassicGame({
  initialPool,
  categoryId,
  categoryLabel,
}: ClassicGameProps) {
  const [deck, setDeck] = useState<GameItem[]>(() => buildDeck(initialPool));
  // IDs consumed during the current cycle. Reset when a new cycle begins.
  const [seenIds, setSeenIds] = useState<Set<string | number>>(() => new Set());

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
          const newSeen = new Set(seenIds);
          newSeen.add(consumed.id);

          if (remaining.length < 2) {
            // Cycle nearly exhausted: carry the unshown tail (0 or 1 items)
            // into a fresh shuffled cycle so no item is skipped and the
            // currently displayed item cannot immediately reappear at the
            // boundary. `seenIds` resets for the new cycle.
            setDeck(buildNextCycle(initialPool, remaining, consumed.id));
            setSeenIds(new Set());
          } else {
            setDeck(remaining);
            setSeenIds(newSeen);
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
    [
      phase,
      nextItem,
      currentItem,
      score,
      highScore,
      deck,
      seenIds,
      categoryId,
      initialPool,
    ],
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
    setSeenIds(new Set());
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
