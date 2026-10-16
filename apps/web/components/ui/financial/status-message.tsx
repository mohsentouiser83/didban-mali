import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function StatusMessage({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLDivElement> & { tone?: "neutral" | "warning" | "success" }) {
  return <div role="status" data-slot="status-message" className={cn(
    "min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere]",
    tone === "neutral" && "text-muted-foreground",
    tone === "warning" && "text-[var(--ds-risk-medium-fg)]",
    tone === "success" && "text-[var(--ds-success)]",
    className,
  )} {...props} />;
}
