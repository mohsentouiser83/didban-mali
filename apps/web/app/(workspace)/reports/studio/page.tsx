import { ReportStudioView } from "@/components/workspace/report-studio/report-studio-view";

export default async function Page({ searchParams }: {
  searchParams: Promise<{ definition?: string | string[] }>;
}) {
  const { definition } = await searchParams;
  return <ReportStudioView definitionId={typeof definition === "string" ? definition : undefined} />;
}
