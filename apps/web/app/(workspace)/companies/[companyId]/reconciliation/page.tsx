"use client";

import { ReconciliationWorkspace } from "@/components/product/reconciliation-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ReconciliationPage() {
  const { company } = useWorkspace();
  return <ReconciliationWorkspace company={company} />;
}
