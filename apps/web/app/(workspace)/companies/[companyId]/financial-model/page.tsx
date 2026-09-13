"use client";

import { FinancialModelWorkspace } from "@/components/product/financial-model-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function FinancialModelPage() {
  const { company } = useWorkspace();
  return <FinancialModelWorkspace company={company} />;
}
