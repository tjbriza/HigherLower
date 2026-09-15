"use client";

import { Infinity, Timer, Users } from "lucide-react";
import { GameMode } from "@/types/game";

interface ModeButtonProps {
  mode: GameMode;
  selected: boolean;
  onClick: () => void;
}

const MODE_META: Record<string, {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  accent: string;
}> = {
  "classic":     { Icon: Infinity, accent: "text-sky-400" },
  "time-attack": { Icon: Timer,    accent: "text-orange-400" },
  "co-op":       { Icon: Users,    accent: "text-slate-500" },
};

export default function ModeButton({ mode, selected, onClick }: ModeButtonProps) {
  const isDisabled = mode.comingSoon;
  const meta = MODE_META[mode.id] ?? { Icon: Infinity, accent: "text-slate-400" };
  const { Icon, accent } = meta;

  return (
    <button
      id={`mode-${mode.id}`}
      onClick={isDisabled ? undefined : onClick}
      aria-pressed={!isDisabled && selected}
      aria-disabled={isDisabled}
      disabled={isDisabled}
      className={`
        relative w-full rounded-xl p-4 text-left
        border transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]
        ${isDisabled
          ? "opacity-40 cursor-not-allowed bg-[#1c2433] border-[rgba(255,255,255,0.07)]"
          : selected
          ? "bg-[#1e2d1e] border-[var(--brand-primary)] shadow-[0_0_0_1px_var(--brand-primary),0_0_20px_rgba(22,163,74,0.25)] cursor-pointer"
          : "bg-[#1c2433] border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.22)] hover:bg-[#222e40] cursor-pointer"
        }
      `}
    >
      {/* Coming soon badge */}
      {isDisabled && (
        <span
          className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest text-slate-500 border border-[rgba(255,255,255,0.08)] uppercase bg-[#111827]"
          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          Soon
        </span>
      )}

      {/* Selected checkmark */}
      {selected && !isDisabled && (
        <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-[var(--brand-primary)] flex items-center justify-center">
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
            <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      )}

      <div className="flex flex-col gap-2">
        {/* Icon */}
        <div className={`${isDisabled ? "text-slate-600" : accent}`}>
          <Icon size={20} strokeWidth={1.8} />
        </div>

        <p
          className={`font-bold leading-snug ${isDisabled ? "text-slate-600" : "text-white"}`}
          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "0.95rem", letterSpacing: "0.02em" }}
        >
          {mode.label}
        </p>
        <p className={`text-[11px] leading-relaxed ${isDisabled ? "text-slate-700" : "text-slate-400"}`}>
          {mode.description}
        </p>
      </div>
    </button>
  );
}
