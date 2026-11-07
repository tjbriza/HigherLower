"use client";

import type { PublicProductionCategory } from "@/lib/catalog/availability";

interface CategoryCardProps {
  category: PublicProductionCategory;
  selected: boolean;
  onClick: () => void;
}

export default function CategoryCard({
  category,
  selected,
  onClick,
}: CategoryCardProps) {
  const unavailable = !category.playable;

  return (
    <label
      className={`group grid min-h-[4.5rem] w-full grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-4 py-4 text-left transition-transform duration-150 ease-out ${unavailable ? "cursor-not-allowed opacity-55" : `cursor-pointer ${selected ? "" : "hover:-translate-y-0.5"}`} focus-within:outline focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-[var(--focus-ring)]`}
    >
      <input
        type="radio"
        name="semantic-category"
        value={category.id}
        checked={!unavailable && selected}
        disabled={unavailable}
        onChange={onClick}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative flex size-4 items-center justify-center rounded-full border-2 transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[var(--focus-ring)] ${selected && !unavailable ? "border-[var(--accent-time-attack)] bg-transparent" : `border-white bg-transparent ${!unavailable ? "group-hover:border-[var(--accent-classic)]" : ""}`}`}
      >
        {selected && !unavailable && (
          <span className="size-2 rounded-full bg-[var(--accent-time-attack)]" />
        )}
      </span>
      <span className="grid gap-1 sm:grid-cols-[minmax(15rem,1fr)_minmax(12rem,0.7fr)] sm:items-center sm:gap-10">
        <span
          className={`font-bold text-2xl leading-tight sm:text-4xl transition-[text-shadow,color] duration-150 ${selected && !unavailable ? "text-white [text-shadow:2px_2px_0_var(--accent-time-attack)]" : !selected && !unavailable ? "text-white group-hover:[text-shadow:3px_3px_0_var(--accent-classic)] group-focus-within:[text-shadow:2px_2px_0_var(--accent-classic)]" : "text-white"}`}
        >
          {category.label}
          {unavailable && (
            <span className="ml-2 align-middle text-[0.65rem] uppercase tracking-wide text-[var(--text-secondary)]">
              Unavailable
            </span>
          )}
        </span>
        <span className="text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
          {category.description}
        </span>
      </span>
    </label>
  );
}
