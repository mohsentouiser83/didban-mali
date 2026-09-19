import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const buttonVariants = cva(
  "ds-focus inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-bold transition-[color,background-color,border-color,box-shadow,transform] duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ds-button-bg)] text-[var(--ds-button-fg)] shadow-[var(--ds-shadow-sm)] hover:bg-[var(--ds-button-hover-bg)] active:translate-y-px",
        accent:
          "bg-[var(--ds-accent)] text-white shadow-[var(--ds-shadow-sm)] hover:brightness-110 active:translate-y-px",
        secondary:
          "bg-[var(--ds-muted)] text-[var(--ds-foreground)] hover:bg-[var(--ds-muted-hover)]",
        outline:
          "border border-[var(--ds-border-strong)] bg-transparent text-[var(--ds-foreground)] hover:bg-[var(--ds-muted)]",
        ghost:
          "text-[var(--ds-foreground-soft)] hover:bg-[var(--ds-muted)] hover:text-[var(--ds-foreground)]",
        destructive:
          "bg-[var(--ds-danger)] text-white hover:brightness-95 shadow-[var(--ds-shadow-sm)]",
        "destructive-subtle":
          "bg-[color-mix(in_oklch,var(--ds-danger)_12%,transparent)] text-[var(--ds-danger)] border border-[color-mix(in_oklch,var(--ds-danger)_25%,transparent)] hover:bg-[color-mix(in_oklch,var(--ds-danger)_20%,transparent)]",
      },
      size: {
        xs: "h-7 min-h-7 px-2.5 text-xs rounded-[calc(var(--ds-button-radius)-2px)] [&_svg]:size-3.5",
        sm: "h-9 min-h-9 px-3 text-xs rounded-[var(--ds-button-radius)] [&_svg]:size-3.5",
        default: "h-11 min-h-11 px-4 text-sm rounded-[var(--ds-button-radius)] [&_svg]:size-4",
        lg: "h-12 min-h-12 px-6 text-base rounded-[calc(var(--ds-button-radius)+2px)] [&_svg]:size-4.5",
        icon: "size-11 min-h-11 min-w-11 p-0 rounded-[var(--ds-button-radius)] [&_svg]:size-4",
        "icon-sm": "size-9 min-h-9 min-w-9 p-0 rounded-[var(--ds-button-radius)] [&_svg]:size-3.5",
        "icon-xs": "size-7 min-h-7 min-w-7 p-0 rounded-[calc(var(--ds-button-radius)-2px)] [&_svg]:size-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
    loadingText?: string;
  };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const isBusy = loading;
    const isDisabled = Boolean(disabled || isBusy);

    if (asChild) {
      return (
        <Slot
          ref={ref}
          aria-busy={isBusy ? true : undefined}
          data-loading={isBusy ? "true" : undefined}
          className={cn(buttonVariants({ variant, size }), className)}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={isBusy ? true : undefined}
        data-loading={isBusy ? "true" : undefined}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {isBusy ? (
          <>
            <Spinner className="size-4 animate-spin shrink-0" />
            <span>{loadingText ?? children}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants, type ButtonProps };
