"use client";
import { forwardRef, type TextareaHTMLAttributes } from "react";

import { useFormFieldFeedback, FormFieldFeedback } from "./form";
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

    const feedback = useFormFieldFeedback(props.id, props.value, hasError);
    const describedBy = [props["aria-describedby"], feedback.error ? feedback.messageId : ""].filter(Boolean).join(" ") || undefined;
    return (<>
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          inputVariants({ size: null }),
          "flex min-h-[88px] p-3 text-sm leading-relaxed",
          className,
        )}
        {...props}
        id={feedback.id}
        aria-invalid={hasError || feedback.error ? "true" : undefined}
        aria-describedby={describedBy}
      /><FormFieldFeedback id={feedback.messageId} message={feedback.error} /></>
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea, type TextareaProps };
