"use client";

import { useParams } from "next/navigation";

import { FindingCaseWorkspace } from "@/components/product/finding-case-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function FindingDetailPage() {
  const { company } = useWorkspace();
  const { findingId } = useParams<{ findingId: string }>();
  return <FindingCaseWorkspace company={company} findingId={findingId} />;
}
