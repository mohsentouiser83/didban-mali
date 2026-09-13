import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "ds-focus inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--ds-button-radius)] px-4 text-sm font-bold transition-[color,background-color,border-color,box-shadow,transform] duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-[var(--ds-button-bg)] text-[var(--ds-button-fg)] shadow-[var(--ds-shadow-sm)] hover:bg-[var(--ds-button-hover-bg)] active:translate-y-px",
        secondary: "bg-[var(--ds-muted)] text-[var(--ds-foreground)] hover:bg-[var(--ds-muted-hover)]",
        outline: "border border-[var(--ds-border-strong)] bg-[var(--ds-card)] text-[var(--ds-foreground)] hover:bg-[var(--ds-muted)]",
        ghost: "text-[var(--ds-foreground-soft)] hover:bg-[var(--ds-muted)] hover:text-[var(--ds-foreground)]",
        destructive: "bg-[var(--ds-danger)] text-white hover:brightness-95",
      },
      size: {
        default: "h-11",
        sm: "h-9 min-h-9 px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "size-11 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
