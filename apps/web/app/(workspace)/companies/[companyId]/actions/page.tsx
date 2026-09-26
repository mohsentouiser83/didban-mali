"use client";

import { MyActionsWorkspace } from "@/components/product/my-actions-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ActionsPage() {
  const { company } = useWorkspace();
  return <MyActionsWorkspace company={company} />;
}
