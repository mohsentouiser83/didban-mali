import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, MouseEvent } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex shrink-0 items-center select-none font-bold whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ds-primary)] text-[var(--ds-primary-foreground)] shadow-xs",
        secondary:
          "bg-[var(--ds-muted)] text-[var(--ds-foreground-soft)] hover:bg-[var(--ds-muted-hover)]",
        outline:
          "border border-[var(--ds-border-strong)] bg-transparent text-[var(--ds-foreground-soft)]",
        success:
          "border border-[color-mix(in_oklch,var(--ds-success)_25%,transparent)] bg-[color-mix(in_oklch,var(--ds-success)_14%,transparent)] text-[var(--ds-success)]",
        warning:
          "border border-[color-mix(in_oklch,var(--ds-warning)_25%,transparent)] bg-[color-mix(in_oklch,var(--ds-warning)_15%,transparent)] text-[color-mix(in_oklch,var(--ds-warning)_80%,var(--ds-foreground))]",
        danger:
          "border border-[color-mix(in_oklch,var(--ds-danger)_25%,transparent)] bg-[color-mix(in_oklch,var(--ds-danger)_13%,transparent)] text-[var(--ds-danger)]",
        accent:
          "border border-[color-mix(in_oklch,var(--ds-accent)_25%,transparent)] bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]",
        info:
          "border border-blue-500/25 bg-blue-500/12 text-blue-600 dark:text-blue-400",
      },
      size: {
        xs: "min-h-5 px-1.5 py-0 text-[10.5px] rounded gap-1 [&_svg]:size-2.5",
        sm: "min-h-6 px-2 py-0.5 text-xs rounded-md gap-1 [&_svg]:size-3",
        default: "min-h-7 px-2.5 py-1 text-xs rounded-full gap-1.5 [&_svg]:size-3.5",
        lg: "min-h-8 px-3.5 py-1 text-sm rounded-full gap-2 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  pulse?: boolean;
  onRemove?: (event: MouseEvent<HTMLButtonElement>) => void;
}

function Badge({
  className,
  variant,
  size,
  dot = false,
  pulse = false,
  onRemove,
  children,
  ...props
}: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full bg-current shrink-0",
            pulse && "animate-pulse",
          )}
          aria-hidden="true"
        />
      )}
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(e);
          }}
          className="ms-0.5 -me-0.5 rounded-full p-0.5 hover:bg-black/15 dark:hover:bg-white/20 transition-colors focus-visible:outline-none"
          aria-label="حذف"
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

export { Badge, badgeVariants };
