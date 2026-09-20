"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const progressVariants = cva(
  "relative w-full overflow-hidden rounded-full bg-[var(--ds-surface-subtle)] border border-[var(--ds-border)]",
  {
    variants: {
      size: {
        xs: "h-1",
        sm: "h-1.5",
        default: "h-2.5",
        lg: "h-4",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const indicatorVariants = cva(
  "h-full rounded-full transition-[width] duration-300 ease-out ms-0 me-auto",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-l from-[#0891b2] to-[var(--ds-primary)] shadow-[0_0_10px_var(--ds-primary-glow)]",
        success:
          "bg-gradient-to-l from-[#059669] to-[var(--ds-success)] shadow-[0_0_10px_var(--ds-success-glow)]",
        warning:
          "bg-gradient-to-l from-[#d97706] to-[var(--ds-warning)] shadow-[0_0_10px_var(--ds-warning-glow)]",
        danger:
          "bg-gradient-to-l from-[#e11d48] to-[var(--ds-danger)] shadow-[0_0_10px_var(--ds-danger-glow)]",
      },
      striped: {
        true: "bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:16px_16px] animate-[progress-stripes_1s_linear_infinite]",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      striped: false,
    },
  }
)

export interface ProgressProps
  extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>,
    VariantProps<typeof progressVariants>,
    VariantProps<typeof indicatorVariants> {
  value?: number
}

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  ProgressProps
>(({ className, value = 0, size = "default", variant = "default", striped = false, ...props }, ref) => {
  const safeValue = Math.min(100, Math.max(0, value ?? 0))

  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={safeValue}
      className={cn(progressVariants({ size }), className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(indicatorVariants({ variant, striped }))}
        style={{ width: `${safeValue}%` }}
      />
    </ProgressPrimitive.Root>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress, progressVariants }
