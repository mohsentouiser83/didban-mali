"use client";
import { cn } from "@/lib/utils";
import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import * as Primitive from "@radix-ui/react-select";
import { useState } from "react";
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
  searchable = false,
  searchPlaceholder = "جستجو...",
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-required": ariaRequired,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const normalize = (text: string) =>
    text.replace(/ي/g, "ی").replace(/ك/g, "ک").trim().toLowerCase();

  const filteredOptions = searchable && searchQuery.trim()
    ? options.filter((option) =>
        normalize(option.label).includes(normalize(searchQuery)),
      )
    : options;

  const selectedOption = options.find((option) => option.value === value);

  return (
    <Primitive.Root
      dir="rtl"
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      onOpenChange={(open) => {
        if (!open) setSearchQuery("");
      }}
    >
      <Primitive.Trigger
        id={id}
        aria-label={label}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired}
        className={cn(
          controlClass,
          "group flex cursor-pointer items-center justify-between gap-3 text-start data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/10 [&>span:first-child]:min-w-0 [&>span:first-child]:truncate",
          className,
        )}
      >
        <Primitive.Value placeholder={placeholder}>
          {selectedOption?.label}
        </Primitive.Value>
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
          className="z-80 max-h-72 min-w-(--radix-select-trigger-width) overflow-hidden rounded-control border border-border bg-surface p-1.5 text-sm shadow-overlay motion-safe:animate-fade-in"
        >
          {searchable && (
            <div className="sticky top-0 z-10 mb-1 border-b border-border/80 bg-surface pb-1.5 pt-0.5">
              <div className="relative flex items-center">
                <MagnifyingGlassIcon
                  size={14}
                  className="pointer-events-none absolute start-2 text-muted"
                  aria-hidden
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onFocus={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key !== "Escape") e.stopPropagation();
                  }}
                  onKeyUp={(e) => e.stopPropagation()}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="h-8 w-full rounded-md border border-border bg-canvas pe-2 ps-7 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          )}
          <Primitive.Viewport className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
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
              ))
            ) : (
              <div className="py-3 text-center text-xs text-muted">
                موردی با این عنوان پیدا نشد
              </div>
            )}
          </Primitive.Viewport>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
