"use client";
import { SettlementsWorkspace } from "@/components/product/settlements-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";
export default function SettlementsPage() {
  const { company } = useWorkspace();
  return <SettlementsWorkspace key={company.id} company={company} />;
}
