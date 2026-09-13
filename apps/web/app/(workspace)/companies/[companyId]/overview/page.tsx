"use client";

import { DashboardWorkspace } from "@/components/product/dashboard-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function OverviewPage() {
  const { company } = useWorkspace();
  return <DashboardWorkspace company={company} />;
}
