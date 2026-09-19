"use client";

import { AlertsWorkspace } from "@/components/product/alerts-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function AlertsPage() {
  const { company } = useWorkspace();
  return <AlertsWorkspace company={company} />;
}
