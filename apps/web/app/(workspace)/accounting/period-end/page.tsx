import { PeriodAccountingView } from "@/components/workspace/period-accounting-view";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period_id?: string | string[] }>;
}) {
  const { period_id } = await searchParams;
  return (
    <PeriodAccountingView
      initialPeriodId={typeof period_id === "string" ? period_id : undefined}
    />
  );
}
