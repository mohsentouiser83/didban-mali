"use client";
import { CheckIcon } from "@phosphor-icons/react";
import * as Primitive from "@radix-ui/react-checkbox";
export function Checkbox({
  id,
  checked,
  onCheckedChange,
  label,
  disabled = false,
  hideLabel = false,
}: {
  id?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-12 items-center gap-3 rounded-control px-2 py-2 transition-colors duration-200 ease-interface has-[:enabled]:cursor-pointer has-[:enabled]:hover:bg-primary-soft/50 has-[:focus-visible]:bg-primary-soft/50 has-[:disabled]:cursor-not-allowed motion-reduce:transition-none"
    >
      <Primitive.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="grid size-5 shrink-0 place-items-center rounded-md border border-border bg-surface text-white outline-none transition-[color,background-color,border-color,box-shadow] duration-200 ease-interface motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-primary data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-50"
      >
        <Primitive.Indicator className="motion-safe:animate-fade-in">
          <CheckIcon size={15} weight="bold" aria-hidden />
        </Primitive.Indicator>
      </Primitive.Root>
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
    </label>
  );
}
