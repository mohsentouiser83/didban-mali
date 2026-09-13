"use client";

import { AiControlCenter } from "@/components/product/ai-control-center";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function AssistantPage() {
  const { company } = useWorkspace();
  return <AiControlCenter company={company} />;
}
