/**
 * Shared center divider for the gameplay comparison region.
 *
 * Rendered as a sibling of the comparison board and the decision controls so it
 * can span the full gameplay region — from just below the header down toward
 * the lower content boundary — rather than terminating at the card height.
 * Desktop-only, matching the approved implementation.
 */
export default function GameplayDivider() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-0 bottom-0 z-0 hidden w-0 -translate-x-1/2 border-l-[3px] border-dashed border-[var(--divider-line)] opacity-70 md:block"
    />
  );
}
