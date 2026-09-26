"use client";

import { ScenariosWorkspace } from "@/components/product/scenarios-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ScenariosPage() {
  const { company } = useWorkspace();
  return <ScenariosWorkspace company={company} />;
}
