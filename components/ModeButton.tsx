"use client";

import { GameMode } from "@/types/game";

interface ModeButtonProps {
  mode: GameMode;
  selected: boolean;
  onClick: () => void;
}

/* Icon background colors per mode */
const modeAccents: Record<string, string> = {
  classic: "from-indigo-500 to-violet-600",
  "time-attack": "from-orange-500 to-rose-500",
  "co-op": "from-slate-600 to-slate-700",
};

export default function ModeButton({ mode, selected, onClick }: ModeButtonProps) {
  const isDisabled = mode.comingSoon;
  const gradient = modeAccents[mode.id] ?? "from-slate-600 to-slate-700";

  return (
    <button
      id={`mode-${mode.id}`}
      onClick={isDisabled ? undefined : onClick}
      aria-pressed={!isDisabled && selected}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      className={`
        relative group w-full rounded-2xl p-5 text-left
        glass transition-all duration-250
        ${isDisabled
          ? "btn-disabled cursor-not-allowed border border-white/[0.04]"
          : selected
          ? "card-selected"
          : "border border-white/[0.07] glass-hover cursor-pointer"
        }
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]
      `}
    >
      {/* Coming soon badge */}
      {isDisabled && (
        <span className="absolute top-3 right-3 rounded-full bg-slate-700/80 border border-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
          Soon
        </span>
      )}

      {/* Selected glow ring */}
      {selected && !isDisabled && (
        <div className="absolute inset-0 rounded-2xl ring-1 ring-[var(--brand-primary)] pointer-events-none" />
      )}

      <div className="flex items-center gap-4">
        {/* Icon bubble */}
        <div
          className={`
            flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center
            text-xl bg-gradient-to-br ${gradient}
            shadow-lg transition-transform duration-200
            ${!isDisabled ? "group-hover:scale-110" : ""}
          `}
        >
          {mode.icon}
        </div>

        <div className="min-w-0">
          <p
            className={`font-semibold text-sm leading-snug font-[family-name:var(--font-display)] ${
              isDisabled ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"
            }`}
          >
            {mode.label}
          </p>
          <p
            className={`mt-0.5 text-xs leading-relaxed ${
              isDisabled ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"
            }`}
          >
            {mode.description}
          </p>
        </div>
      </div>
    </button>
  );
}
