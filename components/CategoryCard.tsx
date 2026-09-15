"use client";

import { Category } from "@/types/game";

interface CategoryCardProps {
  category: Category;
  selected: boolean;
  onClick: () => void;
}

export default function CategoryCard({ category, selected, onClick }: CategoryCardProps) {
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
          ? "bg-[var(--bg-card)] border-[var(--brand-primary)] shadow-[0_0_0_1px_var(--brand-primary),var(--glow-green)]"
          : "bg-[var(--bg-card)] border-[var(--border-subtle)] hover:border-white/20 hover:bg-[var(--bg-elevated)]"
        }
      `}
    >
      {/* Selected tick */}
      {selected && (
        <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-[var(--brand-primary)] flex items-center justify-center text-[10px] text-white font-black">
          ✓
        </span>
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <span className="text-2xl leading-none select-none mt-0.5">{category.icon}</span>

        <div className="min-w-0">
          <p
            className="font-black text-[var(--text-primary)] text-sm leading-snug"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "1rem", letterSpacing: "0.01em" }}
          >
            {category.label}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)] leading-relaxed">
            {category.description}
          </p>
        </div>
      </div>
    </button>
  );
}
