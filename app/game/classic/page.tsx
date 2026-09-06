import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { fetchGameItems } from "@/lib/api";
import { CATEGORIES } from "@/types/game";
import ClassicGame from "@/components/game/ClassicGame";

// ─── Skeleton fallback ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex-1 flex flex-col md:flex-row animate-pulse p-4 gap-4">
      <div className="flex-1 rounded-2xl shimmer min-h-[320px]" />
      <div className="hidden md:flex items-center justify-center w-20">
        <div className="w-14 h-14 rounded-full bg-[var(--bg-elevated)]" />
      </div>
      <div className="flex-1 flex flex-col gap-3">
        <div className="flex-1 rounded-2xl shimmer min-h-[320px]" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-20 rounded-2xl shimmer" />
          <div className="h-20 rounded-2xl shimmer" />
        </div>
      </div>
    </div>
  );
}

// ─── Inner async component (reads searchParams + fetches) ─────────────────────

async function ClassicGameLoader({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { category } = await searchParams;
  const categoryId = Array.isArray(category) ? category[0] : category;

  // Validate category
  if (!categoryId) redirect("/");

  const meta = CATEGORIES.find((c) => c.id === categoryId);
  if (!meta) notFound();

  let items;
  try {
    items = await fetchGameItems(categoryId);
  } catch (err) {
    // Log full error server-side for debugging
    console.error("[ClassicGameLoader] Failed to fetch game items:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
        <span className="text-5xl">⚠️</span>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">
          Could not load game data
        </h2>
        <p className="text-sm text-[var(--text-secondary)] max-w-sm leading-relaxed">
          {message}
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-2 btn-primary text-sm"
        >
          ← Back to Menu
        </Link>
      </div>
    );
  }

  return (
    <ClassicGame
      initialPool={items}
      categoryId={meta.id}
      categoryLabel={meta.label}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClassicPage(props: PageProps<"/game/classic">) {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ClassicGameLoader searchParams={props.searchParams} />
    </Suspense>
  );
}
