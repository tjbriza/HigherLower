import { notFound, redirect } from "next/navigation";
import { authorizeGameRoute } from "@/lib/catalog/routeAuthorization";
import { fetchGameItems } from "@/lib/api";
import DerivedGameState from "@/components/game/DerivedGameState";
import ClassicGame from "@/components/game/ClassicGame";

// ─── Inner async component (reads and authorizes searchParams) ────────────────

async function ClassicGameLoader({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { category } = await searchParams;
  const authorization = authorizeGameRoute("classic", category);

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
    <ClassicGame
      initialPool={items}
      categoryId={authorization.category.id}
      categoryLabel={authorization.category.label}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClassicPage(props: PageProps<"/game/classic">) {
  return <ClassicGameLoader searchParams={props.searchParams} />;
}
