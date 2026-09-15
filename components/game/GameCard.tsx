"use client";

import { useState } from "react";
import { GameItem } from "@/types/api";

interface GameCardProps {
  item: GameItem;
  revealed: boolean;
  side: "current" | "next";
  resultTint?: "correct" | "incorrect" | null;
}

export default function GameCard({
  item,
  revealed,
  side,
  resultTint,
}: GameCardProps) {
  const [bgError, setBgError] = useState(false);
  const showValue = side === "current" || revealed;
  const hasImage = !!item.imageUrl && !bgError;

  return (
    <div className="relative w-full h-full overflow-hidden">

      {/* ── Layer 1: Full-bleed background image ─────────────────────── */}
      {hasImage ? (
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
      )}

      {/* ── Layer 2: Gradient scrim — heavier at bottom for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/30 z-10" />

      {/* ── Layer 3: Result colour wash ────────────────────────────────── */}
      {resultTint && (
        <div
          className={`absolute inset-0 z-10 transition-colors duration-300 ${
            resultTint === "correct" ? "bg-emerald-500/20" : "bg-rose-500/20"
          }`}
        />
      )}

      {/* ── Layer 4: Bottom-left card info ─────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-5 pb-4 sm:pb-5">
        {/* Side label */}
        <p
          className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/50 mb-1"
          style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          {side === "current" ? "Current" : "Next"}
        </p>

        {/* Item name */}
        <h2
          className="font-black text-white leading-tight uppercase"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: "clamp(1.2rem, 4vw, 1.75rem)",
            letterSpacing: "0.02em",
          }}
        >
          {item.name}
        </h2>

        {/* Value — current card always shows, next card shows after reveal */}
        <div
          className={`transition-all duration-500 ${
            showValue ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
          }`}
        >
          <p
            className="font-black text-amber-400 mt-0.5"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "clamp(1.1rem, 3.5vw, 1.5rem)",
            }}
          >
            {item.displayValue}
          </p>
        </div>
      </div>

      {/* ── Layer 5: Result flash border ring ──────────────────────────── */}
      {resultTint && (
        <div
          className={`absolute inset-0 z-30 border-[4px] pointer-events-none transition-opacity duration-300 ${
            resultTint === "correct" ? "border-emerald-400" : "border-rose-500"
          }`}
        />
      )}
    </div>
  );
}
