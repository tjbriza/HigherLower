"use client";

import Image from "next/image";
import { GameItem } from "@/types/api";

interface GameCardProps {
  item: GameItem;
  /** When true the value is revealed with an animated fade-in */
  revealed: boolean;
  /** Visual label: "current" card always shows value; "next" card hides until revealed */
  side: "current" | "next";
  /** Overlay tint applied on correct/incorrect reveal */
  resultTint?: "correct" | "incorrect" | null;
}

export default function GameCard({
  item,
  revealed,
  side,
  resultTint,
}: GameCardProps) {
  const showValue = side === "current" || revealed;

  const tintClass =
    resultTint === "correct"
      ? "bg-emerald-500/30"
      : resultTint === "incorrect"
        ? "bg-rose-500/30"
        : "bg-black/40";

  return (
    <div className="relative w-full h-full min-h-[320px] overflow-hidden rounded-2xl group">
      {/* Background image */}
      <Image
        src={item.imageUrl}
        alt={item.name}
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        className="object-cover transition-transform duration-700 group-hover:scale-105"
        priority
      />

      {/* Gradient overlay */}
      <div
        className={`absolute inset-0 transition-colors duration-500 ${tintClass}`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-6 gap-2">
        {/* Side label */}
        <span className="section-label text-white/50 mb-1">
          {side === "current" ? "Current" : "Next"}
        </span>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight drop-shadow-lg line-clamp-2 font-[family-name:var(--font-display)]">
          {item.name}
        </h2>

        {/* Value */}
        <div
          className={`transition-all duration-500 ${
            showValue ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <p className="text-3xl sm:text-4xl font-black text-gradient leading-none mt-1">
            {item.displayValue}
          </p>
        </div>

        {/* Hidden hint */}
        {!showValue && (
          <p className="text-sm text-white/50 italic animate-pulse">
            Higher or Lower?
          </p>
        )}
      </div>

      {/* Result flash ring */}
      {resultTint && (
        <div
          className={`absolute inset-0 rounded-2xl border-4 transition-opacity duration-300 ${
            resultTint === "correct"
              ? "border-emerald-400"
              : "border-rose-500"
          }`}
        />
      )}
    </div>
  );
}
