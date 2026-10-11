import Link from "next/link";
import { ArrowLeft, LoaderCircle, TriangleAlert } from "lucide-react";

export type DerivedGameStateKind =
  "loading" | "empty" | "unavailable" | "setup-incomplete" | "error";

interface DerivedGameStateProps {
  kind: DerivedGameStateKind;
  title?: string;
  description?: string;
  actionHref?: string | null;
  actionLabel?: string;
  className?: string;
}

const DEFAULT_COPY: Record<
  DerivedGameStateKind,
  { title: string; description: string }
> = {
  loading: {
    title: "Loading comparison",
    description: "Preparing the next items…",
  },
  empty: {
    title: "Not enough comparison items",
    description: "Try another category with more available items.",
  },
  unavailable: {
    title: "Category unavailable",
    description: "This comparison category is not available yet.",
  },
  "setup-incomplete": {
    title: "Category setup incomplete",
    description:
      "This category needs an approved data mapping before play can start.",
  },
  error: {
    title: "Unable to load this comparison",
    description:
      "The comparison could not be prepared. Return to setup and try another category.",
  },
};

export default function DerivedGameState({
  kind,
  title,
  description,
  actionHref = "/",
  actionLabel = "Back to setup",
  className = "",
}: DerivedGameStateProps) {
  const isLoading = kind === "loading";
  const copy = DEFAULT_COPY[kind];

  return (
    <main
      aria-live={isLoading ? "polite" : "assertive"}
      aria-busy={isLoading}
      className={`relative z-10 flex min-h-64 flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center ${className}`}
    >
      {isLoading ? (
        <LoaderCircle
          aria-hidden="true"
          className="animate-spin text-[var(--focus-ring)] motion-reduce:animate-none"
          size={30}
        />
      ) : kind === "error" || kind === "empty" ? (
        <TriangleAlert
          aria-hidden="true"
          className="text-[var(--accent-highlight)]"
          size={28}
        />
      ) : null}
      <div className="max-w-lg">
        <h1 className="text-xl font-bold uppercase tracking-[0.08em] text-[var(--foreground-primary)] sm:text-2xl">
          {title ?? copy.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--foreground-muted)]">
          {description ?? copy.description}
        </p>
      </div>
      {!isLoading && actionHref !== null && (
        <Link
          href={actionHref}
          className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 border-2 border-white bg-[var(--surface-background)] px-5 py-3 text-sm font-bold uppercase tracking-[0.1em] text-white shadow-[5px_5px_0_var(--accent-classic)] transition-transform hover:-translate-y-1"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          {actionLabel}
        </Link>
      )}
    </main>
  );
}
