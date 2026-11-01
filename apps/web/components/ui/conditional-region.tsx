import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/** Unmount inactive fields so hidden controls cannot receive focus or block validation. */
export function ConditionalRegion({
  show = true,
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"div"> & { show?: boolean }) {
  if (!show) return null;

  return (
    <div
      {...props}
      className={cn("min-w-0 motion-safe:animate-page-reveal", className)}
    >
      {children}
    </div>
  );
}
