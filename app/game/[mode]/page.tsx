import { notFound, redirect } from "next/navigation";
import { authorizeGameRoute } from "@/lib/catalog/routeAuthorization";
import { fetchGameItems } from "@/lib/api";
import DerivedGameState from "@/components/game/DerivedGameState";
import ClassicGame from "@/components/game/ClassicGame";
import TimeAttackGame from "@/components/game/TimeAttackGame";

/**
 * /game/[mode] — route dispatcher
 *
 * Validates dynamic game entry parameters before any provider mapping, then
 * dispatches the authorized semantic category to its provider path and renders
 * the selected mode component with normalized items.
 */
export default async function GameModePage(props: PageProps<"/game/[mode]">) {
  const { mode } = await props.params;
  const sp = await props.searchParams;
  const authorization = authorizeGameRoute(mode, sp.category);

  if (authorization.status === "missing-category") redirect("/");
  if (
    authorization.status === "invalid-category" ||
    authorization.status === "unsupported-mode" ||
    authorization.status === "incompatible-mode"
  ) {
    notFound();
  }

  if (authorization.status === "unavailable") {
    return <DerivedGameState kind="unavailable" />;
  }

  // Authorization succeeded: only now may the provider dispatcher run.
  let items;
  try {
    items = await fetchGameItems(authorization.providerCategory);
  } catch {
    return <DerivedGameState kind="error" />;
  }

  if (items.length < 2) {
    return <DerivedGameState kind="empty" />;
  }

  const { mode: playableMode, category } = authorization;
  if (playableMode === "classic") {
    return (
      <ClassicGame
        initialPool={items}
        categoryId={category.id}
        categoryLabel={category.label}
      />
    );
  }

  return (
    <TimeAttackGame
      initialPool={items}
      categoryId={category.id}
      categoryLabel={category.label}
    />
  );
}
