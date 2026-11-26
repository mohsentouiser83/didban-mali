import { InventoryView } from "@/components/workspace/inventory-view";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ warehouse_id?: string | string[] }>;
}) {
  const { warehouse_id } = await searchParams;
  return <InventoryView initialWarehouse={typeof warehouse_id === "string" ? warehouse_id : undefined} />;
}
