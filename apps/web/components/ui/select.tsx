"use client";
import { Select as Primitive, Switch as SwitchPrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import { useFormValidation } from "./form";
import { FieldError } from "./field";
import { Check, ChevronDown } from "lucide-react";
export type Option = { value: string; label: string };
export function Select({
  id,
  value,
  onValueChange,
  options,
  label,
  disabled,
  name,
  validate,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
  label?: string;
  disabled?: boolean;
  name?: string;
  validate?: (value: string) => string | null;
}) {
  const register = useFormValidation(),
    [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      validate
        ? register?.(id, () => {
            const result = validate(value);
            setError(result);
            return result;
          })
        : undefined,
    [register, id, value, validate],
  );
  return (
    <>
      <Primitive.Root
        name={name}
        dir="rtl"
        value={value}
        onValueChange={(value) => {
          setError(null);
          onValueChange(value);
        }}
        disabled={disabled}
      >
        <Primitive.Trigger
          id={id}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-control border border-border bg-surface px-3 outline-none transition-colors duration-200 hover:border-primary/40 focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/10 disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/10"
        >
          <Primitive.Value placeholder="انتخاب کنید" />
          <Primitive.Icon>
            <ChevronDown size={16} aria-hidden />
          </Primitive.Icon>
        </Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content
            position="popper"
            sideOffset={6}
            className="z-60 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-control border border-border bg-surface p-1 shadow-float motion-safe:animate-dialog"
          >
            <Primitive.Viewport>
              {options.map((o) => (
                <Primitive.Item
                  key={o.value}
                  value={o.value}
                  className="relative flex min-h-11 cursor-default items-center rounded-lg py-2 ps-9 pe-3 outline-none data-highlighted:bg-accent data-highlighted:text-primary"
                >
                  <Primitive.ItemText>{o.label}</Primitive.ItemText>
                  <Primitive.ItemIndicator className="absolute start-3">
                    <Check size={15} />
                  </Primitive.ItemIndicator>
                </Primitive.Item>
              ))}
            </Primitive.Viewport>
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </>
  );
}
export function Switch({
  id,
  checked,
  onCheckedChange,
  disabled,
  label,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      dir="ltr"
      className="flex min-h-11 min-w-12 items-center rounded-control px-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40"
    >
      <span className="flex h-6 w-11 rounded-full bg-border p-1 transition-colors duration-200 [[data-state=checked]_&]:bg-primary">
        <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-surface shadow-sm transition-transform duration-200 data-[state=checked]:translate-x-5 motion-reduce:transition-none" />
      </span>
    </SwitchPrimitive.Root>
  );
}
