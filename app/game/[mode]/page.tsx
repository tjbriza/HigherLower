"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CATEGORIES, GAME_MODES } from "@/types/game";
import { Suspense } from "react";

function GameContent() {
  const params = useParams<{ mode: string }>();
  const searchParams = useSearchParams();

  const modeId = params.mode;
  const categoryId = searchParams.get("category");

  const mode = GAME_MODES.find((m) => m.id === modeId);
  const category = CATEGORIES.find((c) => c.id === categoryId);

  return (
    <main className="relative flex-1 flex flex-col items-center justify-center min-h-dvh px-4 gap-6">
      {/* Ambient orb */}
      <div className="orb w-[400px] h-[400px] bg-[var(--brand-primary)] opacity-[0.08] top-0 left-1/2 -translate-x-1/2" />

      <div className="relative z-10 glass rounded-3xl p-10 max-w-md w-full text-center border border-white/[0.08]">
        <p className="section-label mb-3">Coming Up</p>
        <h1 className="text-3xl font-black text-gradient mb-2">
          {mode?.label ?? "Unknown Mode"}
        </h1>
        <p className="text-[var(--text-secondary)] text-sm mb-6">
          Category:{" "}
          <span className="font-semibold text-[var(--text-primary)]">
            {category?.icon} {category?.label ?? "Unknown"}
          </span>
        </p>
        <p className="text-[var(--text-muted)] text-sm leading-relaxed">
          🚧 The game screen is being built. This page confirms your route is
          working correctly:{" "}
          <code className="text-[var(--brand-primary)]">
            /game/{modeId}?category={categoryId}
          </code>
        </p>

        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 btn-primary text-sm"
        >
          ← Back to Menu
        </Link>
      </div>
    </main>
  );
}

export default function GamePage() {
  return (
    <Suspense>
      <GameContent />
    </Suspense>
  );
}
