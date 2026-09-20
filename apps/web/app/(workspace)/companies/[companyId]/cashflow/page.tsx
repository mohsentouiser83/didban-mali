"use client";

import { TreasuryWorkspace } from "@/components/product/treasury-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function CashFlowPage() {
  const { company } = useWorkspace();
  return <TreasuryWorkspace company={company} defaultTab="cashflow" />;
}
