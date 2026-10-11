"use client";

import type { PublicProductionCategory } from "@/lib/catalog/availability";
import CategoryCard from "@/components/CategoryCard";

interface CategorySelectorProps {
  categories: readonly PublicProductionCategory[];
  selectedCategoryId: PublicProductionCategory["id"] | null;
  onSelect: (category: PublicProductionCategory) => void;
}

export default function CategorySelector({
  categories,
  selectedCategoryId,
  onSelect,
}: CategorySelectorProps) {
  return (
    <section
      aria-labelledby="category-selector-heading"
      className="border-t-2 border-white/70 pt-8 pb-8"
    >
      <h2 id="category-selector-heading" className="sr-only">
        Choose a category
      </h2>
      {categories.length === 0 ? (
        <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
          Categories will appear here when their production data sources are
          ready.
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-labelledby="category-selector-heading"
          className="grid gap-x-8"
        >
          {categories.map((category) => {
            const { id, domainId, label, description } = category;
            return (
              <CategoryCard
                key={id}
                category={{
                  id,
                  domainId,
                  label,
                  description,
                  metricDescription: category.metricDescription,
                  displayFormat: category.displayFormat,
                  compatibleModes: category.compatibleModes,
                  playable: category.playable,
                }}
                selected={selectedCategoryId === id}
                onClick={() => onSelect(category)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
