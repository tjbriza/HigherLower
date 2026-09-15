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
  /** Desktop only — action buttons rendered inside the centered content column */
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

  // ─── Shared fragments ───────────────────────────────────────────────────────

  const resultTintLayer = resultTint && (
    <div
      className={`absolute inset-0 z-10 transition-colors duration-300 ${
        resultTint === "correct" ? "bg-emerald-500/20" : "bg-rose-500/20"
      }`}
    />
  );

  const resultBorderLayer = resultTint && (
    <div
      className={`absolute inset-0 z-30 pointer-events-none transition-opacity duration-300 ${
        resultTint === "correct"
          ? "border-[4px] border-emerald-400"
          : "border-[4px] border-rose-500"
      }`}
    />
  );

  const bgImage = hasImage ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={item.imageUrl}
      alt=""
      aria-hidden="true"
      className="absolute inset-0 w-full h-full object-cover z-0"
      loading="eager"
      onError={() => setBgError(true)}
    />
  ) : (
    <div className="absolute inset-0 bg-gradient-to-br from-[#1a2035] via-[#111828] to-[#080b14] z-0" />
  );

  const bgImageBlurred = hasImage ? (
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
    <div className="absolute inset-0 bg-gradient-to-br from-[#1a2035] via-[#111828] to-[#080b14] z-0" />
  );

  // ─── Thumbnail for desktop ───────────────────────────────────────────────────
  const thumbnail = (
    <div
      className="relative rounded-xl overflow-hidden shadow-2xl ring-2 ring-white/10"
      style={{
        width:
          thumbnailAspect === "landscape"
            ? "clamp(180px, 45%, 280px)"
            : "clamp(110px, 28%, 170px)",
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
          <span className="text-4xl opacity-30 select-none">?</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative w-full h-full overflow-hidden">

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP (md+): blurred bg + dark scrim + centered thumbnail column
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="absolute inset-0 hidden md:flex flex-col">
        {bgImageBlurred}
        <div className="absolute inset-0 bg-black/55 z-10" />
        {resultTintLayer}

        {/* Centered content */}
        <div className="relative z-20 w-full h-full flex flex-col items-center justify-center text-center px-6 pt-16 pb-6 gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40"
                style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            {side === "current" ? "Current" : "Next Up"}
          </span>

          {thumbnail}

          <h2 className="text-2xl lg:text-3xl font-black text-white drop-shadow-lg leading-tight max-w-xs mt-1"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.01em" }}>
            {item.name}
          </h2>

          {/* Value */}
          <div className={`transition-all duration-500 ${showValue ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}`}>
            <p className="text-3xl lg:text-4xl font-black text-amber-400 drop-shadow-lg leading-none my-1"
               style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
              {item.displayValue}
            </p>
          </div>

          {/* "Higher or Lower?" hint */}
          {!showValue && (
            <p className="text-sm text-white/40 italic animate-pulse">Higher or Lower?</p>
          )}

          {/* Desktop action buttons slot */}
          {children && (
            <div className="mt-3 flex flex-col items-center gap-3 w-64">
              {children}
            </div>
          )}
        </div>

        {resultBorderLayer}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE (<md): full-bleed bg + gradient scrim + bottom-left text
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="absolute inset-0 flex md:hidden flex-col">
        {bgImage}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/30 z-10" />
        {resultTintLayer}

        {/* Bottom-left card info */}
        <div className="absolute bottom-0 left-0 right-0 z-20 px-5 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50 mb-1"
             style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            {side === "current" ? "Current" : "Next"}
          </p>
          <h2 className="font-black text-white leading-tight uppercase"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: "clamp(1.2rem, 4vw, 1.75rem)",
                letterSpacing: "0.02em",
              }}>
            {item.name}
          </h2>
          <div className={`transition-all duration-500 ${showValue ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}>
            <p className="font-black text-amber-400 mt-0.5"
               style={{
                 fontFamily: "'Barlow Condensed', sans-serif",
                 fontSize: "clamp(1.1rem, 3.5vw, 1.5rem)",
               }}>
              {item.displayValue}
            </p>
          </div>
        </div>

        {resultBorderLayer}
      </div>

    </div>
  );
}
