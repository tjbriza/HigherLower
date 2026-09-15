"use client";

import { GameMode } from "@/types/game";

interface ModeButtonProps {
  mode: GameMode;
  selected: boolean;
  onClick: () => void;
}

/* Border + icon accent per mode */
const modeColors: Record<string, { icon: string; label: string }> = {
  "classic":     { icon: "♾️", label: "Classic" },
  "time-attack": { icon: "⏱️", label: "Time Attack" },
  "co-op":       { icon: "🤝", label: "Co-op" },
};

export default function ModeButton({ mode, selected, onClick }: ModeButtonProps) {
  const isDisabled = mode.comingSoon;

  return (
    <button
      id={`mode-${mode.id}`}
      onClick={isDisabled ? undefined : onClick}
      aria-pressed={!isDisabled && selected}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      className={`
        relative w-full rounded-xl p-3.5 text-left
        border transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]
        ${isDisabled
          ? "opacity-40 cursor-not-allowed bg-[var(--bg-card)] border-[var(--border-subtle)]"
          : selected
          ? "bg-[var(--bg-card)] border-[var(--brand-primary)] shadow-[0_0_0_1px_var(--brand-primary),var(--glow-green)] cursor-pointer"
          : "bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-white/20 hover:bg-[var(--bg-elevated)] cursor-pointer"
        }
      `}
    >
      {/* Coming soon badge */}
      {isDisabled && (
        <span className="absolute top-2.5 right-2.5 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-[var(--text-muted)] border border-[var(--border-subtle)] uppercase bg-[var(--bg-elevated)]">
          Soon
        </span>
      )}

      {/* Selected tick */}
      {selected && !isDisabled && (
        <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-[var(--brand-primary)] flex items-center justify-center text-[9px] text-white font-black">
          ✓
        </span>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xl leading-none">{modeColors[mode.id]?.icon ?? mode.icon}</span>
        <p
          className={`font-black text-sm leading-snug ${isDisabled ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}
          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "0.95rem", letterSpacing: "0.01em" }}
        >
          {mode.label}
        </p>
        <p className={`text-[11px] leading-relaxed ${isDisabled ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"}`}>
          {mode.description}
        </p>
      </div>
    </button>
  );
}
