"use client";

import { useState } from "react";
import { GameItem } from "@/types/api";

interface GameCardProps {
  item: GameItem;
  revealed: boolean;
  side: "current" | "next";
  resultTint?: "correct" | "incorrect" | null;
  /** "portrait" (2:3) for game covers / movie posters, "landscape" (3:2) for flags */
  thumbnailAspect?: "portrait" | "landscape";
  /** Optional slot — rendered inside the centered content (used for action buttons) */
  children?: React.ReactNode;
}

export default function GameCard({
  item,
  revealed,
  side,
  resultTint,
  thumbnailAspect = "portrait",
  children,
}: GameCardProps) {
  const [bgError, setBgError] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const showValue = side === "current" || revealed;

  const hasImage = !!item.imageUrl && !bgError;

  return (
    <div className="relative w-full h-full overflow-hidden">

      {/* ── Layer 1: Blurred full-background image ───────────────────── */}
      {hasImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={item.imageUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl z-0"
          loading="eager"
          onError={() => setBgError(true)}
        />
      ) : (
        /* Fallback gradient when no image */
        <div className="absolute inset-0 bg-gradient-to-br from-[#1a1f35] via-[#111828] to-[#080b14] z-0" />
      )}

      {/* ── Layer 2: Dark scrim so content is always readable ────────── */}
      <div className="absolute inset-0 bg-black/55 z-10" />

      {/* ── Layer 3: Result colour wash (correct/incorrect) ──────────── */}
      {resultTint && (
        <div
          className={`absolute inset-0 z-10 transition-colors duration-300 ${
            resultTint === "correct" ? "bg-emerald-500/20" : "bg-rose-500/20"
          }`}
        />
      )}

      {/* ── Layer 4: Centered content ─────────────────────────────────── */}
      <div className="relative z-20 w-full h-full flex flex-col items-center justify-center text-center px-4 pt-16 md:pt-20 pb-4 md:pb-6 gap-2 md:gap-3">

        {/* Side label */}
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">
          {side === "current" ? "Current" : "Next Up"}
        </span>

        {/* ── Crisp thumbnail card (the focused image in the window) ── */}
        <div
          className="relative rounded-xl overflow-hidden shadow-2xl ring-2 ring-white/10"
          style={{
            width: thumbnailAspect === "landscape" ? "clamp(180px, 45%, 280px)" : "clamp(110px, 28%, 170px)",
            aspectRatio: thumbnailAspect === "landscape" ? "3/2" : "2/3",
          }}
        >
          {!thumbError && item.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-full h-full object-cover"
              loading="eager"
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#2a2f50] to-[#1a1f35] flex items-center justify-center">
              <span className="text-4xl opacity-30 select-none">
                {side === "current" ? "🎯" : "❓"}
              </span>
            </div>
          )}
        </div>

        {/* Name */}
        <h2 className="text-xl sm:text-2xl md:text-4xl font-black text-white drop-shadow-lg leading-tight max-w-xs mt-1">
          {item.name}
        </h2>

        {/* Value (visible on current, animated reveal on next) */}
        <div
          className={`transition-all duration-500 ${
            showValue ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
          }`}
        >
          <p className="text-3xl sm:text-4xl md:text-5xl font-black text-amber-400 drop-shadow-lg leading-none my-1">
            {item.displayValue}
          </p>
        </div>

        {/* "Higher or Lower?" hint shown only on unrevealed next card */}
        {!showValue && (
          <p className="text-sm text-white/40 italic animate-pulse">
            Higher or Lower?
          </p>
        )}

        {/* Slot for buttons (next card injects Higher / Lower here) */}
        {children && (
          <div className="mt-2 md:mt-4 flex flex-col items-center gap-2 md:gap-3 w-56 md:w-64">
            {children}
          </div>
        )}
      </div>

      {/* ── Layer 5: Result flash border ring ───────────────────────── */}
      {resultTint && (
        <div
          className={`absolute inset-0 z-30 border-[5px] pointer-events-none transition-opacity duration-300 ${
            resultTint === "correct" ? "border-emerald-400" : "border-rose-500"
          }`}
        />
      )}
    </div>
  );
}
