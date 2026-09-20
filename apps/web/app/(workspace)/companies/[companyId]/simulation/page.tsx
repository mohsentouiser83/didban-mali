"use client";

import { RisksWorkspace } from "@/components/product/risks-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function SimulationPage() {
  const { company } = useWorkspace();
  return <RisksWorkspace company={company} defaultTab="simulation" />;
}
