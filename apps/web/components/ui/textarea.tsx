import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  isInvalid?: boolean;
};

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, isInvalid, "aria-invalid": ariaInvalid, ...props }, ref) => {
    const hasError = Boolean(isInvalid || ariaInvalid === true || ariaInvalid === "true");

    return (
      <textarea
        ref={ref}
        aria-invalid={hasError ? "true" : undefined}
        className={cn(
          "ds-focus flex min-h-[88px] w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-input-border)] bg-[var(--ds-input-bg)] p-3 text-sm text-[var(--ds-foreground)] leading-relaxed shadow-[var(--ds-shadow-sm)] transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[var(--ds-foreground-faint)] hover:border-[var(--ds-primary)] disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--ds-muted)] aria-invalid:border-[var(--ds-danger)] aria-invalid:bg-[color-mix(in_oklch,var(--ds-danger)_6%,transparent)] aria-invalid:text-[var(--ds-danger)]",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea, type TextareaProps };
