import { ProductShell } from "@/components/product/product-shell";
import { WorkspaceProvider } from "@/components/product/workspace-provider";

export default function CompanyWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceProvider><ProductShell>{children}</ProductShell></WorkspaceProvider>;
}
