"use client";

import { ControlPoliciesWorkspace } from "@/components/product/control-policies-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function ControlPoliciesPage() {
  const { company } = useWorkspace();
  return <ControlPoliciesWorkspace company={company} />;
}
