import { forwardRef, type InputHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "ds-focus w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-input-border)] bg-[var(--ds-input-bg)] text-[var(--ds-foreground)] shadow-[var(--ds-shadow-sm)] transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[var(--ds-foreground-faint)] hover:border-[var(--ds-primary)] disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--ds-muted)] aria-invalid:border-[var(--ds-danger)] aria-invalid:bg-[color-mix(in_oklch,var(--ds-danger)_6%,transparent)] aria-invalid:text-[var(--ds-danger)]",
  {
    variants: {
      size: {
        sm: "h-9 min-h-9 px-3 text-xs",
        default: "h-11 min-h-11 px-3.5 text-sm",
        lg: "h-12 min-h-12 px-4 text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> &
  VariantProps<typeof inputVariants> & {
    isInvalid?: boolean;
  };

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, type, isInvalid, "aria-invalid": ariaInvalid, ...props }, ref) => {
    const hasError = Boolean(isInvalid || ariaInvalid === true || ariaInvalid === "true");

    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={hasError ? "true" : undefined}
        className={cn(inputVariants({ size }), className)}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input, inputVariants, type InputProps };
