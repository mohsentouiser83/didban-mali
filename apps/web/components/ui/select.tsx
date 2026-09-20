"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

export type SelectSize = "sm" | "default" | "lg";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;
const SelectGroup = SelectPrimitive.Group;

export const selectTriggerVariants = cva(
  "group ds-focus flex w-full items-center justify-between gap-2.5 rounded-[var(--ds-radius-control)] border border-[var(--ds-input-border)] bg-[var(--ds-input-bg)] text-[var(--ds-foreground)] transition-[border-color,box-shadow,background-color] duration-200 hover:border-[var(--ds-primary)] disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 select-none",
  {
    variants: {
      size: {
        sm: "h-9 px-3 text-xs",
        default: "h-11 px-3.5 text-sm",
        lg: "h-12 px-4 text-base",
      },
      isInvalid: {
        true: "border-[var(--ds-danger)] bg-[var(--ds-danger-subtle)] hover:border-[var(--ds-danger)] focus:border-[var(--ds-danger)] focus:ring-[var(--ds-danger)] text-[var(--ds-foreground)]",
        false: "",
      },
    },
    defaultVariants: {
      size: "default",
      isInvalid: false,
    },
  }
);

export interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof selectTriggerVariants> {
  isInvalid?: boolean;
}

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, children, size = "default", isInvalid = false, ...props }, ref) => {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      aria-invalid={isInvalid ? "true" : undefined}
      className={cn(selectTriggerVariants({ size, isInvalid }), className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-[var(--ds-foreground-soft)] transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

export interface SelectContentProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> {}

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(({ className, children, position = "popper", sideOffset = 2, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      dir="rtl"
      position={position}
      sideOffset={sideOffset}
      className={cn(
        "relative z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-[var(--ds-border-strong)] bg-[var(--ds-surface-elevated)] text-[var(--ds-foreground)] shadow-xl",
        "menu-animated-content",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex h-6 cursor-default items-center justify-center py-1 text-[var(--ds-foreground-soft)]">
        <ChevronUp className="size-4" />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport
        className={cn(
          "p-1.5",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="flex h-6 cursor-default items-center justify-center py-1 text-[var(--ds-foreground-soft)]">
        <ChevronDown className="size-4" />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

export interface SelectItemProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {}

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-lg py-2 ps-8 pe-3 text-sm outline-none transition-colors",
      "text-[var(--ds-foreground)] focus:bg-[var(--ds-surface-subtle)] focus:text-[var(--ds-foreground)] hover:bg-[var(--ds-surface-subtle)] data-[highlighted]:bg-[var(--ds-surface-subtle)] data-[highlighted]:text-[var(--ds-foreground)]",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      className
    )}
    {...props}
  >
    <span className="absolute start-2.5 flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4 text-[var(--ds-primary)] font-bold" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2.5 py-1.5 text-xs font-bold text-[var(--ds-muted-fg)] uppercase tracking-wider", className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-[var(--ds-border)]", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
