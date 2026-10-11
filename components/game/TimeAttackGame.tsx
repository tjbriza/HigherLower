/**
 * TimeAttackGame — client-side game logic for Time Attack Mode.
 *
 * Rules:
 *   - 60-second countdown that keeps running through reveals.
 *   - Correct guess → +1 score, +3 s bonus, 800 ms reveal then advance.
 *   - Wrong guess   → −5 s penalty (clamped ≥ 0), 400 ms shake+flash then
 *     advance immediately (game does NOT end on wrong answers).
 *   - Timer hits 0  → game over modal ("Time's Up!").
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
import { ArrowLeft, Timer } from "lucide-react";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_TIME = 60;
const BONUS_CORRECT = 3;
const PENALTY_WRONG = 5;
const REVEAL_MS_CORRECT = 800;
const REVEAL_MS_WRONG = 400;

// ─── Types ────────────────────────────────────────────────────────────────────

type GamePhase = "playing" | "revealing" | "game-over";
type ResultTint = "correct" | "incorrect" | null;

interface TimeAttackGameProps {
  initialPool: GameItem[];
  categoryId: SemanticCategoryId;
  categoryLabel: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function dedupeAdjacentEquals(arr: GameItem[]): GameItem[] {
  const out = [...arr];
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].value === out[i + 1].value) {
      let j = i + 2;
      while (j < out.length && out[j].value === out[i].value) j++;
      if (j < out.length) [out[i + 1], out[j]] = [out[j], out[i + 1]];
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

// Pad a number to 2 digits
const pad2 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, "0");

// ─── Component ────────────────────────────────────────────────────────────────

export default function TimeAttackGame({
  initialPool,
  categoryId,
  categoryLabel,
}: TimeAttackGameProps) {
  // ── Deck ───────────────────────────────────────────────────────────────────
  const [deck, setDeck] = useState<GameItem[]>(() => buildDeck(initialPool));
  const [spent, setSpent] = useState<GameItem[]>([]);

  const currentItem = deck[0];
  const nextItem = deck[1];

  // ── Game state ─────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<GamePhase>("playing");
  const [score, setScore] = useState(0);
  const [tint, setTint] = useState<ResultTint>(null);
  const [shaking, setShaking] = useState(false);

  // ── Timer (ref = source of truth; state = display) ─────────────────────────
  const timerRef = useRef(INITIAL_TIME);
  const [displayTime, setDisplayTime] = useState(INITIAL_TIME);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<GamePhase>("playing");

  // Floating delta label (+3s / -5s)
  const [deltaLabel, setDeltaLabel] = useState<{
    key: number;
    text: string;
    color: string;
  } | null>(null);
  const deltaKeyRef = useRef(0);

  const guessLocked = useRef(false);

  // Guards the one-time high-score write for a completed run. The write is a
  // side effect and must not run during render (see the game-over effect).
  const scoreWrittenRef = useRef(false);

  const getHighScoreSnapshot = useCallback(
    () => readHighScore({ mode: "time-attack", categoryId }),
    [categoryId],
  );
  const highScore = useSyncExternalStore(
    subscribeHighScores,
    getHighScoreSnapshot,
    () => 0,
  );

  // ── Timer logic ────────────────────────────────────────────────────────────
  function startTimer() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (phaseRef.current === "game-over") return;
      timerRef.current = Math.max(0, timerRef.current - 1);
      setDisplayTime(timerRef.current);
      if (timerRef.current <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        phaseRef.current = "game-over";
        guessLocked.current = true;
        setPhase("game-over");
        setTint(null);
      }
    }, 1000);
  }

  useEffect(() => {
    startTimer();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync phaseRef whenever phase changes
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Persist the completed run's score exactly once, after the transition into
  // game-over. Writing here (an effect boundary) keeps the high-score store's
  // synchronous subscriber notification out of the render phase.
  useEffect(() => {
    if (phase !== "game-over" || scoreWrittenRef.current) return;
    scoreWrittenRef.current = true;
    if (score > highScore) {
      writeHighScore({ mode: "time-attack", categoryId }, score);
    }
  }, [phase, score, highScore, categoryId]);

  // ── Deck ref (mirrors deck state — avoids stale closure in setTimeout) ────
  const deckRef = useRef(deck);
  const spentRef = useRef(spent);
  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);
  useEffect(() => {
    spentRef.current = spent;
  }, [spent]);

  // ── Guess handler ──────────────────────────────────────────────────────────
  const handleGuess = useCallback(
    (direction: "higher" | "lower") => {
      if (guessLocked.current || phaseRef.current !== "playing" || !nextItem)
        return;
      guessLocked.current = true;

      const isCorrect =
        direction === "higher"
          ? nextItem.value > currentItem.value
          : nextItem.value < currentItem.value;

      setPhase("revealing");
      setTint(isCorrect ? "correct" : "incorrect");

      if (isCorrect) {
        timerRef.current = Math.min(timerRef.current + BONUS_CORRECT, 999);
        setDisplayTime(timerRef.current);
        deltaKeyRef.current += 1;
        setDeltaLabel({
          key: deltaKeyRef.current,
          text: `+${BONUS_CORRECT}s`,
          color: "text-emerald-400",
        });
      } else {
        timerRef.current = Math.max(0, timerRef.current - PENALTY_WRONG);
        setDisplayTime(timerRef.current);
        deltaKeyRef.current += 1;
        setDeltaLabel({
          key: deltaKeyRef.current,
          text: `-${PENALTY_WRONG}s`,
          color: "text-rose-400",
        });
        setShaking(true);
        setTimeout(() => setShaking(false), 460);
      }

      const delay = isCorrect ? REVEAL_MS_CORRECT : REVEAL_MS_WRONG;

      setTimeout(() => {
        setTint(null);
        if (isCorrect) setScore((prev) => prev + 1);

        // Advance deck using refs (no stale closure)
        const prevDeck = deckRef.current;
        const prevSpent = spentRef.current;
        const consumed = prevDeck[0];
        const remaining = prevDeck.slice(1);
        const newSpent = [...prevSpent, consumed];

        if (remaining.length < 2) {
          const refill = shuffle(newSpent);
          const newDeck = dedupeAdjacentEquals([...remaining, ...refill]);
          setDeck(newDeck);
          setSpent([]);
        } else {
          setDeck(remaining);
          setSpent(newSpent);
        }

        if (phaseRef.current !== "game-over") {
          phaseRef.current = "playing";
          setPhase("playing");
        }
        guessLocked.current = false;
      }, delay);
    },
    [nextItem, currentItem],
  );

  // ── Keyboard ───────────────────────────────────────────────────────────────
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
    guessLocked.current = false;
    scoreWrittenRef.current = false;
    const newDeck = shuffleDeck(initialPool);
    setDeck(newDeck);
    setSpent([]);
    setScore(0);
    timerRef.current = INITIAL_TIME;
    setDisplayTime(INITIAL_TIME);
    setTint(null);
    setShaking(false);
    setDeltaLabel(null);
    phaseRef.current = "playing";
    setPhase("playing");
    startTimer();
  }

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!currentItem || !nextItem) {
    return (
      <GameplayShell
        mode="time-attack"
        title={`${categoryLabel} · Time Attack`}
      >
        <DerivedGameState kind="empty" />
      </GameplayShell>
    );
  }

  // ── Timer display helpers ──────────────────────────────────────────────────
  const isUrgent = displayTime <= 10 && phase !== "game-over";
  const timerPct = Math.min(100, (displayTime / INITIAL_TIME) * 100);

  return (
    <GameplayShell
      mode="time-attack"
      title={`${categoryLabel} · Time Attack`}
      subtitle="Race the clock"
      status={
        <div className="flex items-center gap-11">
          <GameplayStatus value={score} label="Score" />
          {highScore > 0 && <GameplayStatus value={highScore} label="Best" />}
        </div>
      }
      headerFooter={
        <div className="flex items-center gap-4">
          {/* Single numeric countdown — the redundant "second(s) left" copy is
              intentionally omitted; the progress bar conveys remaining time. */}
          <div className="relative shrink-0">
            <div
              role="timer"
              aria-label={`${displayTime} seconds remaining`}
              aria-live={isUrgent ? "assertive" : "off"}
              className={`text-3xl font-bold tabular-nums ${isUrgent ? "text-[var(--status-error)]" : "text-[var(--foreground-primary)]"}`}
            >
              {pad2(displayTime)}
            </div>
            {deltaLabel && (
              <span
                key={deltaLabel.key}
                aria-hidden="true"
                className={`float-up absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold ${deltaLabel.color}`}
              >
                {deltaLabel.text}
              </span>
            )}
          </div>
          <div
            role="progressbar"
            aria-label="Time remaining"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(timerPct)}
            className="h-3 flex-1 overflow-hidden rounded-full bg-white"
          >
            <div
              className="h-full rounded-full bg-[var(--status-success)] transition-[width] duration-1000 ease-linear"
              style={{ width: `${timerPct}%` }}
            />
          </div>
        </div>
      }
    >
      <div
        className={`relative flex min-h-0 flex-1 flex-col ${shaking ? "shake" : ""}`}
      >
        <GameplayDivider />

        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none absolute inset-x-0 top-2 z-30 text-center text-xs font-bold uppercase tracking-[0.18em] transition-opacity ${tint !== null ? "opacity-100" : "opacity-0"}`}
        >
          {tint === "correct"
            ? "Correct · +3 seconds"
            : "Incorrect · −5 seconds"}
        </div>

        <ComparisonBoard
          current={
            <GameCard
              key={currentItem.id}
              item={currentItem}
              revealed
              side="current"
              resultTint={phase === "revealing" ? tint : null}
              mode="time-attack"
            />
          }
          next={
            <GameCard
              key={nextItem.id}
              item={nextItem}
              revealed={phase === "revealing"}
              side="next"
              resultTint={phase === "revealing" ? tint : null}
              mode="time-attack"
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

      {phase === "game-over" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="time-attack-game-over-title"
          className="absolute inset-0 z-50 flex items-center justify-center bg-[#15122b]/90 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md border-2 border-white bg-[var(--surface-raised)] p-7 text-center shadow-[8px_8px_0_var(--accent-time-attack)]">
            <div className="mb-2 flex items-center justify-center gap-2 text-[var(--accent-time-attack)]">
              <Timer size={22} strokeWidth={2} />
              <h2
                id="time-attack-game-over-title"
                className="text-2xl font-bold uppercase"
              >
                Time&apos;s up
              </h2>
            </div>
            <p className="mb-6 text-sm text-[var(--foreground-muted)]">
              {categoryLabel} · Time Attack
            </p>

            <div className="mb-6 flex justify-center gap-10">
              <GameplayStatus value={score} label="Correct" />
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
