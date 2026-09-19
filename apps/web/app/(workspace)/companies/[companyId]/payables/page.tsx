"use client";

import { PayablesWorkspace } from "@/components/product/payables-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function PayablesPage() {
  const { company } = useWorkspace();
  return <PayablesWorkspace company={company} />;
}
