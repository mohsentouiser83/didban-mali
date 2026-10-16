"use client";
import { FinancialPeriodsWorkspace } from "@/components/product/financial-periods-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";
export default function FinancialPeriodsPage() {
  const { company } = useWorkspace();
  return <FinancialPeriodsWorkspace key={company.id} company={company} />;
}
