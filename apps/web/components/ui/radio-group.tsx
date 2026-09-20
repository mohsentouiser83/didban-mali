"use client"

import * as React from "react"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn("grid gap-2.5", className)}
      {...props}
      ref={ref}
    />
  )
})
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const radioGroupItemVariants = cva(
  "aspect-square rounded-full border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] text-[var(--ds-primary)] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-primary)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface-card)] disabled:cursor-not-allowed disabled:opacity-45 hover:border-[var(--ds-primary)] grid place-content-center",
  {
    variants: {
      variant: {
        default:
          "data-[state=checked]:border-[var(--ds-primary)] data-[state=checked]:shadow-[0_0_10px_var(--ds-primary-glow)]",
        success:
          "data-[state=checked]:border-[var(--ds-success)] data-[state=checked]:shadow-[0_0_10px_var(--ds-success-glow)] hover:border-[var(--ds-success)]",
      },
      size: {
        sm: "h-4 w-4",
        default: "h-[18px] w-[18px]",
        lg: "h-[22px] w-[22px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface RadioGroupItemProps
  extends React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>,
    VariantProps<typeof radioGroupItemVariants> {
  isInvalid?: boolean
}

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  RadioGroupItemProps
>(({ className, variant, size = "default", isInvalid, ...props }, ref) => {
  const dotSizeClass =
    size === "sm"
      ? "h-1.5 w-1.5"
      : size === "lg"
      ? "h-2.5 w-2.5"
      : "h-2 w-2"

  const dotColorClass =
    variant === "success"
      ? "bg-[var(--ds-success)]"
      : "bg-[var(--ds-primary)]"

  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      aria-invalid={isInvalid ? "true" : props["aria-invalid"]}
      className={cn(
        radioGroupItemVariants({ variant, size }),
        isInvalid &&
          "border-[var(--ds-danger)] focus-visible:ring-[var(--ds-danger)]/40 hover:border-[var(--ds-danger)]",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="grid place-content-center">
        <span
          className={cn(
            "rounded-full block animate-in zoom-in-50 duration-150",
            dotSizeClass,
            dotColorClass
          )}
        />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
})
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

const RadioCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { selected?: boolean }
>(({ className, selected, ...props }, ref) => (
  <div
    ref={ref}
    data-selected={selected ? "true" : "false"}
    className={cn(
      "flex items-start gap-3 p-4 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface-card)] transition-all duration-150 cursor-pointer hover:border-[var(--ds-border-strong)]",
      selected &&
        "border-[var(--ds-primary)] bg-[var(--ds-primary)]/5 shadow-[0_4px_14px_var(--ds-primary-glow)]",
      className
    )}
    {...props}
  />
))
RadioCard.displayName = "RadioCard"

export { RadioGroup, RadioGroupItem, RadioCard, radioGroupItemVariants }
