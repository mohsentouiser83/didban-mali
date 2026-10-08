import { forwardRef, type InputHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const inputVariants = cva(
  "ds-control w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-input-border)] bg-[var(--ds-input-bg)] text-[var(--ds-control-ink)] shadow-[var(--ds-control-shadow)] placeholder:text-[var(--ds-control-caption)] disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--ds-control-muted)] aria-invalid:border-[var(--ds-danger)]",
  {
    variants: {
      size: {
        sm: "h-9 min-h-9 px-3 text-sm",
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
  (
    { className, size, type, isInvalid, "aria-invalid": ariaInvalid, ...props },
    ref,
  ) => {
    const hasError = Boolean(
      isInvalid || ariaInvalid === true || ariaInvalid === "true",
    );

    return (
      <input
        ref={ref}
        data-slot="input"
        type={type}
        aria-invalid={hasError ? "true" : undefined}
        className={cn(
          type === "hidden"
            ? undefined
            : type === "checkbox" || type === "radio"
              ? "ds-focus size-[18px] shrink-0 cursor-pointer accent-[var(--ds-primary)] disabled:cursor-not-allowed disabled:opacity-50"
              : type === "range"
                ? "ds-focus w-full cursor-pointer accent-[var(--ds-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                : inputVariants({ size }),
          type === "file" &&
            "file:me-3 file:rounded-md file:border-0 file:bg-[var(--ds-muted)] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[var(--ds-foreground)]",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input, inputVariants, type InputProps };
