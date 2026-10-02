import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { fetchGameItems } from "@/lib/api";
import { CATEGORIES } from "@/types/game";
import TimeAttackGame from "@/components/game/TimeAttackGame";

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex-1 flex flex-col animate-pulse">
      {/* Header shimmer */}
      <div className="h-[88px] shimmer border-b border-white/5" />
      {/* Cards */}
      <div className="flex-1 flex flex-col md:flex-row">
        <div className="flex-1 shimmer" />
        <div className="flex-1 shimmer opacity-70" />
      </div>
    </div>
  );
}

// ─── Inner async loader ───────────────────────────────────────────────────────

async function TimeAttackLoader({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { category } = await searchParams;
  const categoryId = Array.isArray(category) ? category[0] : category;

  if (!categoryId) redirect("/");

  const meta = CATEGORIES.find((c) => c.id === categoryId);
  if (!meta) notFound();

  let items;
  try {
    items = await fetchGameItems(categoryId);
  } catch (err) {
    console.error("[TimeAttackLoader] Failed to fetch game items:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
        <span className="text-4xl font-black text-rose-400"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
          ERROR
        </span>
        <h2 className="text-xl font-bold text-white">Could not load game data</h2>
        <p className="text-sm text-slate-400 max-w-sm leading-relaxed">{message}</p>
        <Link href="/" className="mt-2 inline-flex items-center gap-2 btn-primary text-sm">
          ← Back to Menu
        </Link>
      </div>
    );
  }

  return (
    <TimeAttackGame
      initialPool={items}
      categoryId={meta.id}
      categoryLabel={meta.label}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TimeAttackPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <TimeAttackLoader searchParams={props.searchParams} />
    </Suspense>
  );
}
