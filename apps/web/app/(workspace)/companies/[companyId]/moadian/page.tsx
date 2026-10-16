"use client";
import { MoadianWorkspace } from "@/components/product/moadian-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";
export default function MoadianPage() {
  const { company } = useWorkspace();
  return <MoadianWorkspace key={company.id} company={company} />;
}
