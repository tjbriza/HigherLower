import { notFound, redirect } from "next/navigation";
import { authorizeGameRoute } from "@/lib/catalog/routeAuthorization";
import { fetchGameItems } from "@/lib/api";
import DerivedGameState from "@/components/game/DerivedGameState";
import TimeAttackGame from "@/components/game/TimeAttackGame";

// ─── Inner async route authorization ─────────────────────────────────────────

async function TimeAttackLoader({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { category } = await searchParams;
  const authorization = authorizeGameRoute("time-attack", category);

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

  return (
    <TimeAttackGame
      initialPool={items}
      categoryId={authorization.category.id}
      categoryLabel={authorization.category.label}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TimeAttackPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <TimeAttackLoader searchParams={props.searchParams} />;
}
