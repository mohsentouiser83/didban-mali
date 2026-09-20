"use client"

import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check, Minus } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const checkboxVariants = cva(
  "group peer shrink-0 rounded-[4px] border transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface-card)] disabled:cursor-not-allowed disabled:opacity-45 grid place-content-center",
  {
    variants: {
      variant: {
        default:
          "border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] data-[state=checked]:bg-[var(--ds-primary)] data-[state=checked]:border-[var(--ds-primary)] data-[state=checked]:text-[var(--ds-primary-fg)] data-[state=indeterminate]:bg-[var(--ds-primary)] data-[state=indeterminate]:border-[var(--ds-primary)] data-[state=indeterminate]:text-[var(--ds-primary-fg)] hover:border-[var(--ds-primary)]",
        success:
          "border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] data-[state=checked]:bg-[var(--ds-success)] data-[state=checked]:border-[var(--ds-success)] data-[state=checked]:text-white data-[state=indeterminate]:bg-[var(--ds-success)] data-[state=indeterminate]:border-[var(--ds-success)] data-[state=indeterminate]:text-white hover:border-[var(--ds-success)]",
      },
      size: {
        sm: "h-4 w-4",
        default: "h-[18px] w-[18px]",
        lg: "h-[22px] w-[22px] rounded-[5px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {
  isInvalid?: boolean
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, variant, size = "default", isInvalid, checked, ...props }, ref) => {
  const iconSizeClass =
    size === "sm" ? "h-3 w-3 stroke-[2.5]" : size === "lg" ? "h-4 w-4 stroke-[2.5]" : "h-3.5 w-3.5 stroke-[2.5]"

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      checked={checked}
      aria-invalid={isInvalid ? "true" : props["aria-invalid"]}
      className={cn(
        checkboxVariants({ variant, size }),
        isInvalid &&
          "border-[var(--ds-danger)] text-[var(--ds-danger)] bg-[var(--ds-danger)]/5 focus-visible:ring-[var(--ds-danger)]/40 hover:border-[var(--ds-danger)]",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className={cn("grid place-content-center text-current")}
      >
        <Minus
          className={cn(
            iconSizeClass,
            "hidden data-[state=indeterminate]:block [[data-state=indeterminate]_&]:block group-data-[state=indeterminate]:block"
          )}
        />
        <Check
          className={cn(
            iconSizeClass,
            "block data-[state=indeterminate]:hidden [[data-state=indeterminate]_&]:hidden group-data-[state=indeterminate]:hidden"
          )}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox, checkboxVariants }
