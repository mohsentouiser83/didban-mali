"use client";

import { ReadinessWorkspace } from "@/components/product/readiness-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ReadinessPage() {
  const { company } = useWorkspace();
  return <ReadinessWorkspace company={company} />;
}
