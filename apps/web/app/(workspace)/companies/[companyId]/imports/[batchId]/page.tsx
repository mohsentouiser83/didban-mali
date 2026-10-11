"use client";

import { useParams } from "next/navigation";

import { ImportWorkspace } from "@/components/product/import-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ImportMappingPage() {
  const { company } = useWorkspace();
  const { batchId } = useParams<{ batchId: string }>();
  return <ImportWorkspace company={company} batchId={batchId} />;
}
