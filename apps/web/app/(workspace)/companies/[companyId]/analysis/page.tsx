"use client";

import { AnalysisWorkspace } from "@/components/product/analysis-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function AnalysisPage() {
  const { company } = useWorkspace();
  return <AnalysisWorkspace company={company} />;
}
