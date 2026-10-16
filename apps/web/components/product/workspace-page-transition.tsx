"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
export function WorkspacePageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div key={pathname} className="min-w-0 motion-safe:animate-[workspace-enter_240ms_ease-out_both]">{children}</div>;
}
