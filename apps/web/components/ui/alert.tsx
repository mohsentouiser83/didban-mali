import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-xl border p-4 text-sm leading-relaxed transition-all [&>svg+div]:translate-y-[-2px] [&>svg]:absolute [&>svg]:start-4 [&>svg]:top-4 [&>svg]:size-5 [&>svg~*]:ps-8",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ds-surface-subtle)] border-[var(--ds-border-strong)] text-[var(--ds-foreground)] [&>svg]:text-[var(--ds-primary)]",
        info:
          "bg-[var(--ds-surface-subtle)] border-[var(--ds-border-strong)] text-[var(--ds-foreground)] [&>svg]:text-[var(--ds-primary)]",
        success:
          "bg-[var(--ds-success-subtle)] border-[color-mix(in_srgb,var(--ds-success)_35%,transparent)] text-[var(--ds-foreground)] [&>svg]:text-[var(--ds-success)] [&_h5]:text-[var(--ds-success)]",
        warning:
          "bg-[var(--ds-warning-subtle)] border-[color-mix(in_srgb,var(--ds-warning)_35%,transparent)] text-[var(--ds-foreground)] [&>svg]:text-[var(--ds-warning)] [&_h5]:text-[var(--ds-warning)]",
        destructive:
          "bg-[var(--ds-danger-subtle)] border-[color-mix(in_srgb,var(--ds-danger)_35%,transparent)] text-[var(--ds-foreground)] [&>svg]:text-[var(--ds-danger)] [&_h5]:text-[var(--ds-danger)]",
        danger:
          "bg-[var(--ds-danger-subtle)] border-[color-mix(in_srgb,var(--ds-danger)_35%,transparent)] text-[var(--ds-foreground)] [&>svg]:text-[var(--ds-danger)] [&_h5]:text-[var(--ds-danger)]",
        accent:
          "bg-[linear-gradient(135deg,var(--ds-surface-subtle),color-mix(in_srgb,var(--ds-accent)_12%,transparent))] border-[color-mix(in_srgb,var(--ds-accent)_35%,transparent)] text-[var(--ds-foreground)] shadow-[0_0_16px_-4px_var(--ds-accent-subtle)] [&>svg]:text-[var(--ds-accent)] [&_h5]:text-[var(--ds-accent)]",
        ai:
          "bg-[linear-gradient(135deg,var(--ds-surface-subtle),color-mix(in_srgb,var(--ds-accent)_12%,transparent))] border-[color-mix(in_srgb,var(--ds-accent)_35%,transparent)] text-[var(--ds-foreground)] shadow-[0_0_16px_-4px_var(--ds-accent-subtle)] [&>svg]:text-[var(--ds-accent)] [&_h5]:text-[var(--ds-accent)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
)
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-bold text-sm tracking-tight text-[var(--ds-foreground)]", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-xs sm:text-sm text-[var(--ds-foreground-soft)] leading-relaxed [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription, alertVariants }
