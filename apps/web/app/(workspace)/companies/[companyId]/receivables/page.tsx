"use client";

import { TreasuryWorkspace } from "@/components/product/treasury-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ReceivablesPage() {
  const { company } = useWorkspace();
  return <TreasuryWorkspace company={company} defaultTab="receivables" />;
}
