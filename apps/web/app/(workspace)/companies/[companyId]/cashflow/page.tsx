"use client";

import { CashFlowWorkspace } from "@/components/product/cashflow-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function CashFlowPage() {
  const { company } = useWorkspace();
  return <CashFlowWorkspace company={company} />;
}
