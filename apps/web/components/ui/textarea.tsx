import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import { inputVariants } from "@/components/ui/input";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  isInvalid?: boolean;
};

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, isInvalid, "aria-invalid": ariaInvalid, ...props }, ref) => {
    const hasError = Boolean(
      isInvalid || ariaInvalid === true || ariaInvalid === "true",
    );

    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        aria-invalid={hasError ? "true" : undefined}
        className={cn(
          inputVariants({ size: null }),
          "flex min-h-[88px] p-3 text-sm leading-relaxed",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea, type TextareaProps };
