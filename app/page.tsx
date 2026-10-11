import { getProductionCatalogProjection } from "@/lib/catalog/availability";
import HomeSetup from "@/components/home/HomeSetup";

export default function HomePage() {
  const catalog = getProductionCatalogProjection();

  return <HomeSetup catalog={catalog} />;
}
