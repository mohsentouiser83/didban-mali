"use client";
import { cn, persian } from "@/lib/utils";
import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
export const controlClass =
  "min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors duration-200 ease-interface placeholder:text-muted enabled:hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-60 aria-invalid:border-danger motion-reduce:transition-none";
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} {...props} className={cn(controlClass, className)} />;
});
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={cn(controlClass, "min-h-28 resize-y", className)}
    />
  );
});
export function AmountInput({
  value,
  onValueChange,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type"
> & { value: string; onValueChange: (value: string) => void }) {
  const formatted = (text: string) => {
    const [integer, fraction] = text.split(".");
    return persian(
      integer.replace(/\B(?=(\d{3})+(?!\d))/g, "٬") +
        (fraction !== undefined ? "٫" + fraction : ""),
    );
  };
  return (
    <Input
      {...props}
      inputMode="decimal"
      dir="ltr"
      value={formatted(value)}
      onChange={(event) => {
        const node = event.target;
        const cursor = node.selectionStart ?? 0;
        const preceding = node.value
          .slice(0, cursor)
          .replace(/[٬,]/g, "").length;
        const raw = node.value
          .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
          .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
          .replace(/[٬,]/g, "")
          .replace("٫", ".");
        if (!/^-?\d*(\.\d*)?$/.test(raw)) return;
        onValueChange(raw);
        requestAnimationFrame(() => {
          let count = 0;
          let pos = 0;
          if (preceding > 0) {
            for (const character of formatted(raw)) {
              pos++;
              if (character !== "٬") count++;
              if (count >= preceding) break;
            }
          }
          node.setSelectionRange(pos, pos);
        });
      }}
      className={cn("tabular-nums", props.className)}
    />
  );
}
