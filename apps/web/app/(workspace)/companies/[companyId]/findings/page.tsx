"use client";

import { FindingsWorkspace } from "@/components/product/findings-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function FindingsPage() {
  const { company } = useWorkspace();
  return <FindingsWorkspace company={company} />;
}
