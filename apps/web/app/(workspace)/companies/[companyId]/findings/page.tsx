"use client";

import { RisksWorkspace } from "@/components/product/risks-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function FindingsPage() {
  const { company } = useWorkspace();
  return <RisksWorkspace company={company} defaultTab="findings" />;
}
