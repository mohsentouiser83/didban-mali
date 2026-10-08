"use client";

import { AutomationsWorkspace } from "@/components/product/automations-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function AutomationsPage() {
  const { company } = useWorkspace();
  return <AutomationsWorkspace company={company} />;
}
