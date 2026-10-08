"use client";

import { SimulationWorkspace } from "@/components/product/simulation-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ScenariosPage() {
  const { company } = useWorkspace();
  return <SimulationWorkspace key={company.id} company={company} />;
}
