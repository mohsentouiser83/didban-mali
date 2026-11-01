"use client";
import { cn } from "@/lib/utils";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import * as Primitive from "@radix-ui/react-select";
import { controlClass } from "./input";
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
export function Select({
  id,
  value,
  onValueChange,
  options,
  placeholder = "انتخاب کنید",
  disabled = false,
  label,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <Primitive.Root
      dir="rtl"
      value={value || undefined}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <Primitive.Trigger
        id={id}
        aria-label={label}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={cn(
          controlClass,
          "group flex cursor-pointer items-center justify-between gap-3 text-start data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/10 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate",
          className,
        )}
      >
        <Primitive.Value placeholder={placeholder} />
        <Primitive.Icon>
          <CaretDownIcon
            size={16}
            aria-hidden
            className="shrink-0 text-primary transition-transform duration-200 ease-interface group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </Primitive.Icon>
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          position="popper"
          sideOffset={6}
          className="z-80 max-h-72 min-w-(--radix-select-trigger-width) overflow-auto rounded-control border border-border bg-surface p-1.5 text-sm shadow-overlay motion-safe:animate-fade-in"
        >
          <Primitive.Viewport>
            {options.map((option) => (
              <Primitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex min-h-11 cursor-default items-center gap-2 rounded-lg py-2 ps-8 pe-3 outline-none transition-colors duration-200 ease-interface motion-reduce:transition-none data-highlighted:bg-primary-soft data-highlighted:text-primary data-disabled:opacity-50"
              >
                <Primitive.ItemIndicator className="absolute start-2">
                  <CheckIcon
                    size={16}
                    aria-hidden
                    className="motion-safe:animate-fade-in"
                  />
                </Primitive.ItemIndicator>
                <Primitive.ItemText>{option.label}</Primitive.ItemText>
              </Primitive.Item>
            ))}
          </Primitive.Viewport>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
