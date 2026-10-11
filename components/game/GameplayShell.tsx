import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

export type GameplayMode = "classic" | "time-attack";

interface GameplayShellProps {
  mode: GameplayMode;
  title: string;
  subtitle?: string;
  backHref?: string;
  status?: ReactNode;
  /**
   * Optional full-width row rendered at the bottom of the header, inside the
   * header boundary. Used by Time Attack for its timer progress bar so the
   * treatment belongs to the top bar rather than the gameplay body.
   */
  headerFooter?: ReactNode;
  children: ReactNode;
}

const MODE_ACCENTS: Record<GameplayMode, string> = {
  classic: "var(--accent-classic)",
  "time-attack": "var(--accent-time-attack)",
};

/**
 * Shared gameplay chrome. Game rules and lifecycle state remain with each mode.
 *
 * The header is a self-contained bar: the back control and the score/status
 * region are absolutely positioned so the centered title block stays truly
 * centered on the viewport regardless of their unequal widths.
 */
export default function GameplayShell({
  mode,
  title,
  subtitle = "Higher or Lower",
  backHref = "/",
  status,
  headerFooter,
  children,
}: GameplayShellProps) {
  return (
    <div
      data-gameplay-mode={mode}
      className="relative isolate flex min-h-dvh min-w-0 w-full flex-col overflow-x-hidden bg-grid bg-[var(--surface-background)]"
      style={{ "--gameplay-accent": MODE_ACCENTS[mode] } as React.CSSProperties}
    >
      <header className="relative z-20 flex flex-col border-b-2 border-[var(--border-mid)] bg-[var(--surface-background)]/95 backdrop-blur">
        <div className="relative flex min-h-[5.5rem] items-center justify-center px-4 py-3 sm:px-6">
          {/* Back control — dark circular face + mode-accent lower-right offset,
              matching the OR badge language. The offset is a box-shadow so it
              renders behind the face rather than covering it. */}
          <Link
            href={backHref}
            aria-label="Back to game setup"
            className="group absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-[var(--surface-background)] text-white shadow-[4px_4px_0_var(--gameplay-accent)] transition-transform hover:-translate-y-[calc(50%+2px)] focus-visible:outline-offset-4 sm:left-6"
          >
            <ArrowLeft className="relative z-10" size={20} strokeWidth={2} />
          </Link>

          {/* Centered title block — independent of the side regions' widths. */}
          <div className="min-w-0 max-w-[60vw] px-1 text-center">
            <h1 className="truncate text-sm font-bold uppercase tracking-[0.12em] text-[var(--foreground-primary)] sm:text-base">
              {title}
            </h1>
            <p className="mt-1 text-[0.6rem] uppercase tracking-[0.18em] text-[var(--foreground-muted)] sm:text-xs">
              {subtitle}
            </p>
          </div>

          {/* Score / status region — kept inside the header boundary. */}
          <div className="absolute right-4 top-1/2 flex max-w-[35vw] -translate-y-1/2 items-center justify-end gap-4 overflow-hidden sm:right-6">
            {status}
          </div>
        </div>

        {/* Optional header footer — mode-owned row inside the header boundary. */}
        {headerFooter && (
          <div className="px-4 pb-3 sm:px-6">{headerFooter}</div>
        )}
      </header>

      {children}
    </div>
  );
}
