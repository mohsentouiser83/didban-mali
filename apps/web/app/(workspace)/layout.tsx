import { Shell } from "@/components/workspace/shell";
import { WorkspaceProvider } from "@/hooks/workspace";
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
