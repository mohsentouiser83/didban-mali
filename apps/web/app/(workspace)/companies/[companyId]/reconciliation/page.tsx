"use client";

import { TreasuryWorkspace } from "@/components/product/treasury-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ReconciliationPage() {
  const { company } = useWorkspace();
  return <TreasuryWorkspace company={company} defaultTab="reconciliation" />;
}
