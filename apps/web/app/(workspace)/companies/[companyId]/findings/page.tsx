"use client";

import { ReviewWorkspace } from "@/components/product/review-workspace";
import { useWorkspace } from "@/components/product/workspace-provider";

export default function FindingsPage() {
  const { company } = useWorkspace();
  return <ReviewWorkspace company={company} />;
}
