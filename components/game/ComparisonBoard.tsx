import type { ReactNode } from "react";

interface ComparisonBoardProps {
  current: ReactNode;
  next: ReactNode;
  className?: string;
}

/**
 * Places the two mode-owned comparison cards around a shared OR badge.
 *
 * The center divider is rendered separately by `GameplayDivider` at the
 * gameplay-region level so it can span past the cards toward the lower content
 * boundary. The left/right vertical stagger is intentional editorial
 * composition (see design-reference/tokens/layout.md).
 */
export default function ComparisonBoard({
  current,
  next,
  className = "",
}: ComparisonBoardProps) {
  return (
    <section
      aria-label="Higher or lower comparison"
      className={`relative grid min-h-0 flex-1 grid-cols-1 items-start gap-8 px-4 pb-6 pt-10 sm:gap-10 sm:px-6 sm:pt-16 md:grid-cols-2 md:flex-none md:gap-8 md:pb-3 lg:px-10 ${className}`}
    >
      <div className="relative z-10 flex min-h-0 min-w-0 justify-center md:translate-y-10">
        {current}
      </div>
      <div className="relative z-10 flex min-h-0 min-w-0 justify-center md:-translate-y-2">
        {next}
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 z-20 hidden h-[5.5rem] w-[5.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white bg-[var(--surface-background)] text-xl font-bold text-white shadow-[5px_5px_0_var(--gameplay-accent)] md:flex"
      >
        OR
      </div>
    </section>
  );
}
