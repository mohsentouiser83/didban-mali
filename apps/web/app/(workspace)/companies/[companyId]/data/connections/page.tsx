"use client";

import { IntegrationsWorkspace } from "@/components/product/integrations-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function IntegrationsPage() {
  const { company } = useWorkspace();
  return <IntegrationsWorkspace company={company} />;
}
