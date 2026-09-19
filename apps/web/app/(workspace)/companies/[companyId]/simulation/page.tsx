"use client";

import { SimulationWorkspace } from "@/components/product/simulation-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function SimulationPage() {
  const { company } = useWorkspace();
  return <SimulationWorkspace company={company} />;
}
