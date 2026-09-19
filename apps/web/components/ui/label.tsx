"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const labelVariants = cva(
  "inline-flex items-center gap-1.5 text-xs font-bold leading-none text-[var(--ds-foreground)] select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
);

type LabelProps = React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
  VariantProps<typeof labelVariants> & {
    required?: boolean;
    optional?: boolean;
  };

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, required, optional, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  >
    {children}
    {required && <span className="text-[var(--ds-danger)] font-bold" aria-hidden="true">*</span>}
    {optional && <span className="text-[11px] font-normal text-[var(--ds-foreground-faint)]">(اختیاری)</span>}
  </LabelPrimitive.Root>
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label, labelVariants, type LabelProps };
