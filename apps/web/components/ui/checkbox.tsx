"use client";
import { Checkbox as Primitive } from "radix-ui";
import { Check } from "lucide-react";
export function Checkbox({
  id,
  name,
  value = "on",
  label,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled = false,
}: {
  id: string;
  name?: string;
  value?: string;
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center gap-3 text-sm has-disabled:cursor-default has-disabled:text-muted"
    >
      <Primitive.Root
        id={id}
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={(v) => onCheckedChange?.(v === true)}
        disabled={disabled}
        className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-primary/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white disabled:opacity-50 motion-reduce:transition-none"
      >
        <Primitive.Indicator>
          <Check size={16} aria-hidden />
        </Primitive.Indicator>
      </Primitive.Root>
      <span>{label}</span>
    </label>
  );
}
