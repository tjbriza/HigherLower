"use client";

import { motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
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
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const previousHeightRef = useRef<number | null>(null);
  const heightAnimationRef = useRef<Animation | null>(null);
  const domainKey = categories[0]?.domainId ?? "empty";

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const currentHeight = container.getBoundingClientRect().height;
    const previousHeight = previousHeightRef.current;

    if (previousHeight === null) {
      const initialHeight = container.scrollHeight;
      previousHeightRef.current = initialHeight;
      heightAnimationRef.current?.cancel();
      heightAnimationRef.current = null;
      container.style.height = "auto";
      container.style.overflow = "";
      return;
    }

    const fromHeight = heightAnimationRef.current?.playState === "running"
      ? currentHeight
      : previousHeight;
    heightAnimationRef.current?.cancel();
    const nextHeight = container.scrollHeight;
    previousHeightRef.current = nextHeight;

    if (prefersReducedMotion) {
      heightAnimationRef.current = null;
      container.style.height = "auto";
      container.style.overflow = "";
      return;
    }

    if (Math.abs(fromHeight - nextHeight) < 1) {
      heightAnimationRef.current = null;
      container.style.height = "auto";
      container.style.overflow = "";
      return;
    }

    container.style.height = `${fromHeight}px`;
    container.style.overflow = "hidden";
    const animation = container.animate(
      [{ height: `${fromHeight}px` }, { height: `${nextHeight}px` }],
      { duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
    heightAnimationRef.current = animation;
    animation.onfinish = () => {
      if (heightAnimationRef.current !== animation) return;
      container.style.height = "auto";
      container.style.overflow = "";
      heightAnimationRef.current = null;
    };
  }, [domainKey, prefersReducedMotion]);

  return (
    <section
      aria-labelledby="category-selector-heading"
      className="border-t-2 border-white/70 pt-8 pb-8"
    >
      <h2 id="category-selector-heading" className="sr-only">
        Choose a category
      </h2>
      <div ref={containerRef}>
        <motion.div
          key={domainKey}
          initial={{ opacity: 0, transform: prefersReducedMotion ? "none" : "translateY(1px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={{ duration: prefersReducedMotion ? 0.01 : 0.18, ease: [0.23, 1, 0.32, 1] }}
        >
            {categories.length === 0 ? (
              <p className="text-sm leading-relaxed text-[var(--foreground-muted)]">
                Categories will appear here when their production data sources are ready.
              </p>
            ) : (
              <div role="radiogroup" aria-labelledby="category-selector-heading" className="grid gap-x-8">
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
        </motion.div>
      </div>
    </section>
  );
}
