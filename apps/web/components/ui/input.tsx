import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn("ds-focus h-11 w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-input-border)] bg-[var(--ds-input-bg)] px-3 text-base text-[var(--ds-foreground)] shadow-[var(--ds-shadow-sm)] transition-[border-color,box-shadow] duration-200 placeholder:text-[var(--ds-foreground-faint)] hover:border-[var(--ds-primary)] disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
