"use client";

import { TreasuryWorkspace } from "@/components/product/treasury-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function PayablesPage() {
  const { company } = useWorkspace();
  return <TreasuryWorkspace company={company} defaultTab="payables" />;
}
