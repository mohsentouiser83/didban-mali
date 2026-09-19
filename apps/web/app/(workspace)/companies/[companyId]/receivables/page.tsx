"use client";

import { ReceivablesWorkspace } from "@/components/product/receivables-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ReceivablesPage() {
  const { company } = useWorkspace();
  return <ReceivablesWorkspace company={company} />;
}
