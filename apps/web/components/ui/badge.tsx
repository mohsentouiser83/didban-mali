import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", {
  variants: {
    variant: {
      default: "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)]",
      secondary: "bg-[var(--ds-muted)] text-[var(--ds-foreground-soft)]",
      outline: "border border-[var(--ds-border-strong)] text-[var(--ds-foreground-soft)]",
      success: "bg-[color-mix(in_oklch,var(--ds-success)_14%,transparent)] text-[var(--ds-success)]",
      warning: "bg-[color-mix(in_oklch,var(--ds-warning)_15%,transparent)] text-[color-mix(in_oklch,var(--ds-warning)_80%,var(--ds-foreground))]",
      danger: "bg-[color-mix(in_oklch,var(--ds-danger)_13%,transparent)] text-[var(--ds-danger)]",
      accent: "bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
