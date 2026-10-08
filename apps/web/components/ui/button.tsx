"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type MouseEvent, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const buttonVariants = cva(
  "ds-focus ds-button group inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium select-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none disabled:bg-[var(--ds-control-muted)] disabled:text-[var(--ds-control-caption)] [&_svg]:pointer-events-none cursor-pointer",
  {
    variants: {
      variant: {
        surface: "bg-transparent text-inherit",
        success:
          "bg-[var(--ds-success-foreground)] text-white shadow-[var(--ds-button-shadow)] hover:brightness-95",
        "success-subtle":
          "border border-[color-mix(in_oklch,var(--ds-success)_30%,transparent)] bg-[color-mix(in_oklch,var(--ds-success)_8%,transparent)] text-[var(--ds-success-foreground)] hover:bg-[color-mix(in_oklch,var(--ds-success)_15%,transparent)]",
        default:
          "bg-[var(--ds-button-bg)] text-[var(--ds-button-fg)] shadow-[var(--ds-button-shadow)] hover:bg-[var(--ds-button-hover-bg)] active:bg-[var(--ds-button-active-bg)]",
        accent:
          "bg-[var(--ds-accent)] text-white shadow-[var(--ds-button-shadow)] hover:bg-[var(--ds-button-accent-hover)]",
        secondary:
          "bg-[var(--ds-control-muted)] text-[var(--ds-control-ink)] hover:bg-[var(--ds-control-muted-hover)]",
        outline:
          "border border-[var(--ds-control-border)] bg-[var(--ds-p-white)] text-[var(--ds-control-ink)] hover:bg-[var(--ds-control-muted)] active:bg-[var(--ds-control-selected)]",
        ghost:
          "text-[var(--ds-control-caption)] hover:bg-[var(--ds-control-muted)] hover:text-[var(--ds-control-ink)]",
        destructive:
          "bg-[var(--ds-danger)] text-white hover:bg-[var(--ds-button-danger-hover)] active:bg-[var(--ds-button-danger-active)] shadow-[var(--ds-button-shadow)]",
        "destructive-subtle":
          "bg-[color-mix(in_oklch,var(--ds-danger)_12%,transparent)] text-[var(--ds-danger)] border border-[color-mix(in_oklch,var(--ds-danger)_25%,transparent)] hover:bg-[color-mix(in_oklch,var(--ds-danger)_20%,transparent)]",
      },
      size: {
        auto: "h-auto p-0 whitespace-normal",
        xs: "h-7 min-h-7 px-2.5 text-xs rounded-[calc(var(--ds-button-radius)-2px)] [&_svg]:size-3.5",
        sm: "h-9 min-h-9 px-3 text-sm rounded-[var(--ds-button-radius)] [&_svg]:size-3.5",
        default:
          "h-11 min-h-11 px-4 text-sm rounded-[var(--ds-button-radius)] [&_svg]:size-4",
        lg: "h-12 min-h-12 px-6 text-base rounded-[calc(var(--ds-button-radius)+2px)] [&_svg]:size-4.5",
        icon: "size-11 min-h-11 min-w-11 p-0 rounded-[var(--ds-button-radius)] [&_svg]:size-4",
        "icon-sm":
          "size-9 min-h-9 min-w-9 p-0 rounded-[var(--ds-button-radius)] [&_svg]:size-3.5",
        "icon-xs":
          "size-7 min-h-7 min-w-7 p-0 rounded-[calc(var(--ds-button-radius)-2px)] [&_svg]:size-3",
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
    /** Keep the dedicated motion of navigation and interactive cards. */
    motion?: "default" | "none";
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
      motion = "none",
      disabled,
      children,
      onClickCapture,
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
          data-slot="button"
          data-variant={variant ?? "default"}
          data-size={size ?? "default"}
          data-motion={motion}
          aria-disabled={isDisabled ? true : undefined}
          aria-busy={isBusy ? true : undefined}
          data-loading={isBusy ? "true" : undefined}
          className={cn(buttonVariants({ variant, size }), className)}
          {...props}
          tabIndex={isDisabled ? -1 : props.tabIndex}
          onClickCapture={(event) => {
            if (isDisabled) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            onClickCapture?.(event as MouseEvent<HTMLButtonElement>);
          }}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        ref={ref}
        data-slot="button"
        data-variant={variant ?? "default"}
        data-size={size ?? "default"}
        data-motion={motion}
        disabled={isDisabled}
        aria-busy={isBusy ? true : undefined}
        data-loading={isBusy ? "true" : undefined}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
        onClickCapture={onClickCapture}
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
