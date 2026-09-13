"use client";

import * as ProgressPrimitive from "@radix-ui/react-progress";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Progress({ className, value = 0, ...props }: ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root value={value} className={cn("relative h-2 w-full overflow-hidden rounded-full bg-[var(--ds-muted)]", className)} {...props}>
      <ProgressPrimitive.Indicator className="h-full w-full origin-end rounded-full bg-[linear-gradient(90deg,var(--ds-accent),var(--ds-primary))] transition-transform duration-500" style={{ transform: `translateX(${100 - Math.min(100, Math.max(0, value ?? 0))}%)` }} />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
