import { MoadianReportsView } from "@/components/workspace/moadian-reports-view";

export default async function MoadianReportsPage({ searchParams }: { searchParams: Promise<{ reference?: string | string[] }> }) {
  const { reference } = await searchParams;
  return <MoadianReportsView key={String(reference ?? "")} initialQuery={typeof reference === "string" ? reference : undefined} />;
}
