import type { ReactNode } from "react";
import { WorkspacePageTransition } from "@/components/product/workspace-page-transition";
export default function WorkspaceTemplate({ children }: { children: ReactNode }) {
  return <WorkspacePageTransition>{children}</WorkspacePageTransition>;
}
