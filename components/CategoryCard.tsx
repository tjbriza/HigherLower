"use client";

import {
  Film,
  Gamepad2,
  Star,
  Globe,
} from "lucide-react";
import { Category } from "@/types/game";

// Map category IDs to Lucide icons
const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  "movie-ratings":      Film,
  "game-playerbase":    Gamepad2,
  "game-ratings":       Star,
  "country-populations": Globe,
};

// Per-category accent colour for the icon
const CATEGORY_ACCENTS: Record<string, string> = {
  "movie-ratings":       "text-rose-400",
  "game-playerbase":     "text-violet-400",
  "game-ratings":        "text-amber-400",
  "country-populations": "text-emerald-400",
};

interface CategoryCardProps {
  category: Category;
  selected: boolean;
  onClick: () => void;
}

export default function CategoryCard({ category, selected, onClick }: CategoryCardProps) {
  const Icon = CATEGORY_ICONS[category.id] ?? Film;
  const accent = CATEGORY_ACCENTS[category.id] ?? "text-slate-400";

  return (
    <button
      id={`category-${category.id}`}
      onClick={onClick}
      aria-pressed={selected}
      className={`
        relative w-full text-left rounded-xl p-4
        border transition-all duration-200
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]
        ${selected
          ? "bg-[#1e2d1e] border-[var(--brand-primary)] shadow-[0_0_0_1px_var(--brand-primary),0_0_20px_rgba(22,163,74,0.25)]"
          : "bg-[#1c2433] border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.22)] hover:bg-[#222e40]"
        }
        cursor-pointer
      `}
    >
      {/* Selected checkmark */}
      {selected && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[var(--brand-primary)] flex items-center justify-center">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`mt-0.5 flex-shrink-0 ${accent}`}>
          <Icon size={20} strokeWidth={1.8} />
        </div>

        <div className="min-w-0">
          <p
            className="font-bold text-white leading-snug"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1rem", letterSpacing: "0.02em" }}
          >
            {category.label}
          </p>
          <p className="mt-1 text-xs text-slate-400 leading-relaxed">
            {category.description}
          </p>
        </div>
      </div>
    </button>
  );
}
