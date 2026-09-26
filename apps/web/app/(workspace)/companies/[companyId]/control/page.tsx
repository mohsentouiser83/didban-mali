"use client";

import { ControlWorkspace } from "@/components/product/control-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ControlPage() {
  const { company } = useWorkspace();
  return <ControlWorkspace company={company} />;
}
