"use client";

import { ReportsWorkspace } from "@/components/product/reports-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ReportsPage() {
  const { company } = useWorkspace();
  return <ReportsWorkspace company={company} />;
}
