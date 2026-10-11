"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { GameItem } from "@/types/api";
import type { GameplayMode } from "@/components/game/GameplayShell";

interface GameCardProps {
  item: GameItem;
  revealed: boolean;
  side: "current" | "next";
  resultTint?: "correct" | "incorrect" | null;
  /** Optional legacy action slot; decision behavior remains caller-owned. */
  children?: ReactNode;
  mode?: GameplayMode;
}

const MODE_ACCENTS: Record<GameplayMode, string> = {
  classic: "var(--accent-classic)",
  "time-attack": "var(--accent-time-attack)",
};

/**
 * Comparison card. The image is a near-square panel; the CURRENT / NEXT UP
 * label and the item metadata live *outside* the image, below it, as part of
 * the page layout rather than as an image overlay.
 */
export default function GameCard({
  item,
  revealed,
  side,
  resultTint,
  children,
  mode = "classic",
}: GameCardProps) {
  const [imageError, setImageError] = useState(false);
  const showValue = side === "current" || revealed;

  return (
    <article
      aria-label={`${side === "current" ? "Current" : "Next"}: ${item.name}`}
      className="flex w-full max-w-[27rem] min-w-0 flex-col items-center"
      style={{ "--card-accent": MODE_ACCENTS[mode] } as React.CSSProperties}
    >
      {/* External label — part of the page layout, above the image. */}
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[var(--text-secondary)]">
        {side === "current" ? "Current" : "Next up"}
      </p>

      {/* Near-square image panel with offset accent backing. */}
      <div className="relative w-full">
        <div
          aria-hidden="true"
          className="absolute inset-0 translate-x-2 translate-y-2 rounded-[2.25rem] bg-[var(--card-accent)]"
        />
        <div className="relative aspect-square w-full overflow-hidden rounded-[2.25rem] border-4 border-white bg-[var(--surface-raised)] shadow-[0_9px_0_var(--card-accent)]">
          {!imageError && item.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.imageUrl}
              alt={item.name}
              className="h-full w-full object-cover object-center"
              loading="eager"
              onError={() => setImageError(true)}
            />
          ) : (
            <div
              role="img"
              aria-label={`${item.name} image unavailable`}
              className="flex h-full w-full items-center justify-center bg-[var(--surface-raised)] text-5xl text-white/50"
            >
              ?
            </div>
          )}

          {resultTint && (
            <div
              aria-hidden="true"
              className={`absolute inset-0 z-10 ${resultTint === "correct" ? "bg-[var(--status-success)]/25" : "bg-[var(--status-error)]/25"}`}
            />
          )}

          {resultTint && (
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 z-30 border-4 ${resultTint === "correct" ? "border-[var(--status-success)]" : "border-[var(--status-error)]"}`}
            />
          )}
        </div>
      </div>

      {/* Metadata — below the image, not overlaid. */}
      <div className="mt-5 flex w-full flex-col items-center px-2 text-center">
        <h2 className="max-w-full break-words text-balance text-base font-bold uppercase leading-tight text-white sm:text-2xl">
          {item.name}
        </h2>
        <div aria-live="polite" className="mt-3">
          {showValue ? (
            <p className="break-words text-lg font-bold text-[var(--accent-highlight)] sm:text-3xl">
              {item.displayValue}
            </p>
          ) : (
            <p className="text-sm uppercase tracking-[0.12em] text-[var(--text-secondary)]">
              Higher or lower?
            </p>
          )}
        </div>
        {children && (
          <div className="mt-5 hidden w-full max-w-xs flex-col gap-3 md:flex">
            {children}
          </div>
        )}
      </div>
    </article>
  );
}
