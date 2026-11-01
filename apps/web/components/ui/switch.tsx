"use client";
import * as Primitive from "@radix-ui/react-switch";
export function Switch({ checked, onCheckedChange, disabled, label }: {
  checked: boolean; onCheckedChange: (value: boolean) => void; disabled?: boolean; label: string;
}) {
  return <Primitive.Root dir="ltr" aria-label={label} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled}
    className="inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent bg-border outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 data-[state=checked]:bg-primary motion-reduce:transition-none">
    <Primitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-surface shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-5 motion-reduce:transition-none" />
  </Primitive.Root>;
}
