"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Provides smooth, accessible page transition animations across all route changes.
 * Complies with AGENTS.md motion baseline: 280ms duration, 5px vertical movement,
 * cubic-bezier(0.2, 0.7, 0.2, 1) easing, and prefers-reduced-motion honor.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  const pathname = usePathname();

  return (
    <div
      key={pathname}
      className={cn(
        "min-w-0 motion-safe:animate-page-reveal motion-safe:[animation-fill-mode:both]",
        className,
      )}
    >
      {children}
    </div>
  );
}
