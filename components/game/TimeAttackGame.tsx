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

import { useEffect, useCallback, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trophy, Timer } from "lucide-react";
import { GameItem } from "@/types/api";
import { CategoryId } from "@/types/game";
import GameCard from "@/components/game/GameCard";
import HighScoresModal from "@/components/HighScoresModal";

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
  categoryId: CategoryId;
  categoryLabel: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LS_KEY = (cat: string) => `time_attack_highscore_${cat}`;

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
  } catch { /* ignore */ }
}

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

function buildDeck(pool: GameItem[]): GameItem[] {
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
  const [highScore, setHighScore] = useState(0);
  const [tint, setTint] = useState<ResultTint>(null);
  const [shaking, setShaking] = useState(false);
  const [showScores, setShowScores] = useState(false);

  // ── Timer (ref = source of truth; state = display) ─────────────────────────
  const timerRef = useRef(INITIAL_TIME);
  const [displayTime, setDisplayTime] = useState(INITIAL_TIME);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef<GamePhase>("playing");

  // Floating delta label (+3s / -5s)
  const [deltaLabel, setDeltaLabel] = useState<{ key: number; text: string; color: string } | null>(null);
  const deltaKeyRef = useRef(0);

  const guessLocked = useRef(false);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    setHighScore(getHighScore(categoryId));
  }, [categoryId]);

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
        setScore((prev) => {
          const finalScore = prev;
          setHighScore((hs) => {
            if (finalScore > hs) {
              saveHighScore(categoryId, finalScore);
              return finalScore;
            }
            return hs;
          });
          return finalScore;
        });
      }
    }, 1000);
  }

  useEffect(() => {
    startTimer();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync phaseRef whenever phase changes
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Deck ref (mirrors deck state — avoids stale closure in setTimeout) ────
  const deckRef = useRef(deck);
  const spentRef = useRef(spent);
  useEffect(() => { deckRef.current = deck; }, [deck]);
  useEffect(() => { spentRef.current = spent; }, [spent]);

  // ── Guess handler ──────────────────────────────────────────────────────────
  const handleGuess = useCallback(
    (direction: "higher" | "lower") => {
      if (guessLocked.current || phaseRef.current !== "playing" || !nextItem) return;
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
        setDeltaLabel({ key: deltaKeyRef.current, text: `+${BONUS_CORRECT}s`, color: "text-emerald-400" });
      } else {
        timerRef.current = Math.max(0, timerRef.current - PENALTY_WRONG);
        setDisplayTime(timerRef.current);
        deltaKeyRef.current += 1;
        setDeltaLabel({ key: deltaKeyRef.current, text: `-${PENALTY_WRONG}s`, color: "text-rose-400" });
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
    const newDeck = buildDeck(initialPool);
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
      <div className="flex-1 flex items-center justify-center text-slate-400">
        Not enough items to play. Try another category.
      </div>
    );
  }

  // ── Timer display helpers ──────────────────────────────────────────────────
  const isUrgent = displayTime <= 10 && phase !== "game-over";
  const timerPct = Math.min(100, (displayTime / INITIAL_TIME) * 100);
  const timerBarColor =
    displayTime > 20 ? "#16a34a" : displayTime > 10 ? "#d97706" : "#dc2626";

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={`relative w-full h-full flex flex-col overflow-hidden ${shaking ? "shake" : ""}`}>

      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <header
        className="flex-shrink-0 z-40 px-4 pt-3 pb-0"
        style={{ background: "rgba(8,11,20,0.95)", backdropFilter: "blur(8px)" }}
      >
        {/* Top row: back | category | score+trophy */}
        <div className="flex items-center justify-between mb-2">
          <Link
            href="/"
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 border border-white/10
                       text-white/70 hover:text-white hover:bg-white/20 transition-colors"
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </Link>

          <div className="flex flex-col items-center text-center">
            <p className="text-sm font-black text-white leading-tight"
               style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}>
              {categoryLabel} – Time Attack
            </p>
            <div className="flex items-center gap-1 mt-0.5">
              <Timer size={10} className="text-orange-400" strokeWidth={2} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-400">
                Race the clock
              </p>
            </div>
          </div>

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
        </div>

        {/* ── Prominent timer row ──────────────────────────────────────── */}
        <div className="flex items-center gap-3 pb-3">
          {/* Digital clock */}
          <div className="flex-shrink-0 relative">
            <span
              className={`text-4xl font-black leading-none tabular-nums ${
                isUrgent ? "timer-urgent text-rose-500" : displayTime > 20 ? "text-white" : "text-amber-400"
              }`}
              style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}
            >
              {pad2(displayTime)}
            </span>
            {/* Floating delta label */}
            {deltaLabel && (
              <span
                key={deltaLabel.key}
                className={`float-up absolute -top-5 left-1/2 -translate-x-1/2 text-sm font-black pointer-events-none select-none ${deltaLabel.color}`}
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                {deltaLabel.text}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${timerPct}%`, background: timerBarColor }}
            />
          </div>
        </div>
      </header>

      {/* ── High Scores modal ───────────────────────────────────────────── */}
      <HighScoresModal open={showScores} onClose={() => setShowScores(false)} />

      {/* ── Result flash banner ─────────────────────────────────────────── */}
      <div
        className={`
          absolute top-[120px] inset-x-0 z-50 flex justify-center pointer-events-none
          transition-all duration-200
          ${tint !== null ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}
        `}
      >
        <span
          className={`px-5 py-1.5 rounded-full text-sm font-black shadow-2xl tracking-wide
            ${tint === "correct" ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}
          style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.06em" }}
        >
          {tint === "correct" ? "✓  Correct!" : "✗  Wrong!"}
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

        {/* BOTTOM / RIGHT — next item + buttons */}
        <div className="flex-1 relative">
          <GameCard
            key={nextItem.id}
            item={nextItem}
            revealed={phase === "revealing"}
            side="next"
            resultTint={phase === "revealing" ? tint : null}
            thumbnailAspect={categoryId === "country-populations" ? "landscape" : "portrait"}
          >
            {/* Desktop buttons inside GameCard centered column */}
            {phase !== "game-over" && (
              <>
                <button
                  id="btn-higher-desktop"
                  onClick={() => handleGuess("higher")}
                  disabled={phase !== "playing"}
                  aria-label="Higher"
                  className={`
                    w-full py-4 rounded-full font-black tracking-wide transition-all duration-150
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
                    w-full py-4 rounded-full font-black tracking-wide transition-all duration-150
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

          {/* Mobile buttons — absolutely centered, md:hidden */}
          {phase !== "game-over" && (
            <div className="md:hidden absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 px-8 pointer-events-none">
              <div className="flex flex-col gap-3 w-full max-w-[260px] pointer-events-auto">
                <button
                  id="btn-higher"
                  onClick={() => handleGuess("higher")}
                  disabled={phase !== "playing"}
                  aria-label="Higher"
                  className={`
                    w-full py-4 rounded-full font-black tracking-wide transition-all duration-150
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
                    w-full py-4 rounded-full font-black tracking-wide transition-all duration-150
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

      {/* ── OR badge ────────────────────────────────────────────────────── */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none"
        style={{ marginTop: "30px" }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block w-px h-screen bg-white/10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 md:hidden h-px w-screen bg-white/10" />
        <div
          className="relative w-14 h-14 rounded-full bg-white text-slate-900 font-black flex items-center justify-center text-base shadow-2xl border-4 border-slate-900 select-none"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.04em" }}
        >
          OR
        </div>
      </div>

      {/* ── Game Over modal ─────────────────────────────────────────────── */}
      {phase === "game-over" && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(8,11,20,0.9)", backdropFilter: "blur(16px)" }}
        >
          <div
            className="rounded-2xl p-7 max-w-sm w-full text-center border border-white/10 shadow-2xl"
            style={{ background: "#111827", animation: "gameOverIn 0.35s ease both" }}
          >
            {/* Icon + title */}
            <div className="flex items-center justify-center gap-2 mb-1">
              <Timer size={22} className="text-orange-400" strokeWidth={2} />
              <p
                className="text-4xl font-black text-orange-400"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              >
                TIME'S UP!
              </p>
            </div>
            <p className="text-slate-400 text-sm mb-5">
              {categoryLabel} · Time Attack
            </p>

            {/* Score boxes */}
            <div className="flex gap-3 mb-6">
              <div className="flex-1 rounded-xl py-4 border border-white/[0.08]"
                   style={{ background: "#1c2433" }}>
                <p
                  className="text-4xl font-black text-white leading-none"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  {score}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">Correct</p>
              </div>
              <div className="flex-1 rounded-xl py-4 border border-white/[0.08]"
                   style={{ background: "#1c2433" }}>
                <p
                  className={`text-4xl font-black leading-none ${
                    score >= highScore && score > 0 ? "text-[var(--brand-gold)]" : "text-white"
                  }`}
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
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
                MAIN MENU
              </Link>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes gameOverIn {
          from { opacity: 0; transform: scale(0.93) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
