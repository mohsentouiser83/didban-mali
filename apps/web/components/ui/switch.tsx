"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const switchVariants = cva(
  "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface-card)] disabled:cursor-not-allowed disabled:opacity-45 data-[state=unchecked]:bg-[var(--ds-surface-subtle)] data-[state=unchecked]:border-[var(--ds-border-strong)]",
  {
    variants: {
      variant: {
        default:
          "data-[state=checked]:bg-[var(--ds-primary)] data-[state=checked]:border-[var(--ds-primary)] data-[state=checked]:shadow-[0_0_12px_var(--ds-primary-glow)]",
        success:
          "data-[state=checked]:bg-[var(--ds-success)] data-[state=checked]:border-[var(--ds-success)] data-[state=checked]:shadow-[0_0_12px_var(--ds-success-glow)]",
      },
      size: {
        sm: "h-[18px] w-8 p-0.5",
        default: "h-[22px] w-[42px] p-0.5",
        lg: "h-7 w-[52px] p-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const thumbVariants = cva(
  "pointer-events-none block rounded-full bg-white shadow-md ring-0 transition-transform duration-200",
  {
    variants: {
      size: {
        sm: "h-3.5 w-3.5 data-[state=checked]:translate-x-3.5 rtl:data-[state=checked]:-translate-x-3.5 data-[state=unchecked]:translate-x-0 rtl:data-[state=unchecked]:-translate-x-0",
        default: "h-4 w-4 data-[state=checked]:translate-x-5 rtl:data-[state=checked]:-translate-x-5 data-[state=unchecked]:translate-x-0 rtl:data-[state=unchecked]:-translate-x-0",
        lg: "h-5 w-5 data-[state=checked]:translate-x-6 rtl:data-[state=checked]:-translate-x-6 data-[state=unchecked]:translate-x-0 rtl:data-[state=unchecked]:-translate-x-0",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
    VariantProps<typeof switchVariants> {}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, variant, size = "default", ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(switchVariants({ variant, size }), className)}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb className={cn(thumbVariants({ size }))} />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch, switchVariants }
