"use client";
import { useParams } from "next/navigation";
import { MoadianWorkspace } from "@/components/product/moadian-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";
export default function SavedComparisonPage() {
  const { company } = useWorkspace();
  const { runId } = useParams<{ runId: string }>();
  return <MoadianWorkspace key={`${company.id}:${runId}`} company={company} initialRunId={runId} />;
}
