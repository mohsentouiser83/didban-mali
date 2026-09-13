import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn("ds-focus h-11 w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-input-border)] bg-[var(--ds-input-bg)] px-3 text-sm text-[var(--ds-foreground)] shadow-[var(--ds-shadow-sm)] transition-colors placeholder:text-[var(--ds-foreground-faint)] hover:border-[var(--ds-primary)] disabled:cursor-not-allowed disabled:opacity-50", className)}
      {...props}
    />
  );
}

export { Input };
