import type { ReactNode } from "react";
import { cx } from "./button";
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "primary" | "warning";
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
        tone === "success"
          ? "bg-success/8 text-success"
          : tone === "primary"
            ? "bg-accent text-primary"
            : tone === "warning"
              ? "bg-warning/8 text-warning"
              : "bg-background text-muted",
      )}
    >
      {children}
    </span>
  );
}
