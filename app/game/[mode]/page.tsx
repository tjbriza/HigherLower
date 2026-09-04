import { redirect } from "next/navigation";

/**
 * /game/[mode] — route dispatcher
 *
 * Implemented modes have their own sub-directory (`/game/classic/`).
 * For implemented modes we redirect there, preserving query params.
 * Unimplemented modes show a "coming soon" placeholder.
 */
export default async function GameModePage(
  props: PageProps<"/game/[mode]">,
) {
  const { mode } = await props.params;
  const sp = await props.searchParams;
  const category = Array.isArray(sp.category) ? sp.category[0] : sp.category;

  // Redirect implemented modes to their dedicated pages
  if (mode === "classic") {
    redirect(`/game/classic${category ? `?category=${category}` : ""}`);
  }

  // ── Placeholder for future modes ──────────────────────────────────────────
  return (
    <main className="relative flex-1 flex flex-col items-center justify-center min-h-dvh px-4 gap-6">
      <div className="orb w-[400px] h-[400px] bg-[var(--brand-primary)] opacity-[0.08] top-0 left-1/2 -translate-x-1/2" />

      <div className="relative z-10 glass rounded-3xl p-10 max-w-md w-full text-center border border-white/[0.08]">
        <p className="text-4xl mb-4">🚧</p>
        <h1 className="text-2xl font-black text-gradient mb-2 font-[family-name:var(--font-display)]">
          {mode === "time-attack" ? "Time Attack" : "Co-op Mode"}
        </h1>
        <p className="text-[var(--text-secondary)] text-sm mb-8 leading-relaxed">
          This mode is coming soon. Classic Mode is available now!
        </p>

        <a
          href={category ? `/game/classic?category=${category}` : "/"}
          className="inline-flex items-center gap-2 btn-gold text-sm"
        >
          {category ? "▶ Play Classic Instead" : "← Back to Menu"}
        </a>
      </div>
    </main>
  );
}
