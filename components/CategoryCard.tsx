"use client";

import { Category } from "@/types/game";

interface CategoryCardProps {
  category: Category;
  selected: boolean;
  onClick: () => void;
}

export default function CategoryCard({
  category,
  selected,
  onClick,
}: CategoryCardProps) {
  return (
    <button
      id={`category-${category.id}`}
      onClick={onClick}
      aria-pressed={selected}
      className={`
        relative w-full text-left rounded-2xl p-5 glass glass-hover
        transition-all duration-250
        ${selected ? "card-selected" : "border border-white/[0.06]"}
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]
      `}
    >
      {/* Gradient tint */}
      <div
        className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${category.gradient} opacity-60 pointer-events-none`}
      />

      {/* Selected indicator dot */}
      {selected && (
        <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-[var(--brand-primary)]">
          <span className="absolute inset-0 rounded-full bg-[var(--brand-primary)] pulse-ring" />
        </span>
      )}

      <div className="relative z-10 flex items-start gap-4">
        {/* Icon */}
        <span className="text-3xl leading-none select-none">{category.icon}</span>

        <div className="min-w-0">
          <p className="font-semibold text-[var(--text-primary)] text-sm leading-snug font-[family-name:var(--font-display)]">
            {category.label}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
            {category.description}
          </p>
        </div>
      </div>
    </button>
  );
}
