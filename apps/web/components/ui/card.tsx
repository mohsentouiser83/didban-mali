import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const cardVariants = cva(
  "rounded-[var(--ds-card-radius)] border text-[var(--ds-foreground)] transition-all duration-200",
  {
    variants: {
      variant: {
        default:
          "border-[var(--ds-card-border)] bg-[var(--ds-card-bg)] shadow-[var(--ds-shadow-sm)]",
        elevated:
          "border-[var(--ds-border-strong)] bg-[var(--ds-card-solid)] shadow-[var(--ds-shadow-md)]",
        interactive:
          "cursor-pointer border-[var(--ds-card-border)] bg-[var(--ds-card-bg)] shadow-[var(--ds-shadow-sm)] hover:-translate-y-0.5 hover:border-[var(--ds-primary)] hover:shadow-[var(--ds-shadow-md)] active:translate-y-0",
        ai:
          "border-[color-mix(in_oklch,var(--ds-accent)_35%,transparent)] bg-[linear-gradient(135deg,var(--ds-card-bg),color-mix(in_oklch,var(--ds-accent)_8%,transparent))] shadow-[var(--ds-shadow-sm)]",
        danger:
          "border-[color-mix(in_oklch,var(--ds-danger)_35%,transparent)] bg-[linear-gradient(135deg,var(--ds-card-bg),color-mix(in_oklch,var(--ds-danger)_8%,transparent))] shadow-[var(--ds-shadow-sm)]",
        warning:
          "border-[color-mix(in_oklch,var(--ds-warning)_35%,transparent)] bg-[linear-gradient(135deg,var(--ds-card-bg),color-mix(in_oklch,var(--ds-warning)_8%,transparent))] shadow-[var(--ds-shadow-sm)]",
        subtle:
          "border-transparent bg-[var(--ds-muted)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

function Card({ asChild = false, variant, className, ...props }: CardProps) {
  const Component = asChild ? Slot : "div";
  return (
    <Component
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-5 md:p-6", className)} {...props} />;
}

function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-extrabold text-balance md:text-lg", className)} {...props} />;
}

function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs leading-relaxed text-[var(--ds-foreground-soft)] text-pretty md:text-sm", className)} {...props} />;
}

function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5 md:px-6 md:pb-6", className)} {...props} />;
}

function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-3 px-5 pb-5 md:px-6 md:pb-6", className)} {...props} />;
}

export { Card, cardVariants, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
