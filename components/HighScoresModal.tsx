"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/types/game";

// ─── LocalStorage key format (must match ClassicGame.tsx) ────────────────────
const LS_KEY = (cat: string) => `hl-highscore-classic-${cat}`;

interface Score {
  categoryId: string;
  label: string;
  icon: string;
  best: number;
}

interface HighScoresModalProps {
  open: boolean;
  onClose: () => void;
}

export default function HighScoresModal({ open, onClose }: HighScoresModalProps) {
  const [scores, setScores] = useState<Score[]>([]);

  // Read from localStorage whenever the modal opens
  useEffect(() => {
    if (!open) return;
    const loaded: Score[] = CATEGORIES.map((cat) => {
      let best = 0;
      try {
        best = parseInt(localStorage.getItem(LS_KEY(cat.id)) ?? "0", 10) || 0;
      } catch {
        /* incognito / localStorage blocked */
      }
      return { categoryId: cat.id, label: cat.label, icon: cat.icon, best };
    });
    setScores(loaded);
  }, [open]);

  if (!open) return null;

  const hasAnyScore = scores.some((s) => s.best > 0);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(8, 11, 20, 0.85)", backdropFilter: "blur(14px)" }}
      onClick={onClose}
    >
      {/* Panel — stop click propagation so clicking inside doesn't close */}
      <div
        className="glass rounded-3xl border border-white/10 shadow-2xl w-full max-w-sm p-7"
        style={{ animation: "fadeInScale 0.25s ease both" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏆</span>
            <h2 className="text-xl font-black text-white font-[family-name:var(--font-display)]">
              Best Scores
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full glass border border-white/10 flex items-center justify-center
                       text-[var(--text-muted)] hover:text-white transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Score rows */}
        <div className="flex flex-col gap-3">
          {scores.map((s, i) => (
            <div
              key={s.categoryId}
              className="flex items-center justify-between px-4 py-3 rounded-2xl glass border border-white/[0.07]"
            >
              <div className="flex items-center gap-3">
                {/* Rank badge */}
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black ${
                    i === 0 && s.best > 0
                      ? "bg-[var(--brand-gold)] text-black"
                      : "bg-white/10 text-white/50"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-lg leading-none">{s.icon}</span>
                <span className="text-sm font-semibold text-[var(--text-secondary)]">
                  {s.label}
                </span>
              </div>

              {/* Score */}
              {s.best > 0 ? (
                <div className="text-right">
                  <p
                    className={`text-2xl font-black leading-none ${
                      i === 0 ? "text-[var(--brand-gold)]" : "text-white"
                    }`}
                  >
                    {s.best}
                  </p>
                  <p className="text-[9px] uppercase tracking-widest text-white/30 mt-0.5">
                    streak
                  </p>
                </div>
              ) : (
                <span className="text-xs text-white/20 italic">No score yet</span>
              )}
            </div>
          ))}
        </div>

        {/* Empty state */}
        {!hasAnyScore && (
          <p className="mt-5 text-center text-sm text-[var(--text-muted)] italic">
            Play a round to set your first record! 🎯
          </p>
        )}

        {/* Clear button */}
        {hasAnyScore && (
          <button
            onClick={() => {
              CATEGORIES.forEach((cat) => {
                try { localStorage.removeItem(LS_KEY(cat.id)); } catch { /* ignore */ }
              });
              setScores(scores.map((s) => ({ ...s, best: 0 })));
            }}
            className="mt-5 w-full py-2 rounded-xl text-xs font-semibold text-white/30
                       hover:text-rose-400 transition-colors border border-white/[0.06]
                       hover:border-rose-400/30 glass"
          >
            Reset all scores
          </button>
        )}
      </div>

      {/* Keyframe */}
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
