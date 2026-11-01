"use client";
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useId, useRef, useState } from "react";
import {
  CaretDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { Button } from "./button";
import { Input } from "./input";
import { Skeleton } from "./content-states";
import type { SelectOption } from "./select";
import { cn } from "@/lib/utils";
/** Searchable listbox with server-supplied options, shared focus and keyboard behavior. */
export function SearchSelect({
  id,
  value,
  selectedLabel,
  onValueChange,
  query,
  onQueryChange,
  options,
  loading,
  error,
  hasMore,
  placeholder = "انتخاب کنید",
  searchLabel = "جستجو",
  disabled = false,
  "aria-invalid": invalid,
  "aria-describedby": describedBy,
}: {
  id?: string;
  value: string;
  selectedLabel?: string;
  onValueChange: (value: string, label: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  options: SelectOption[];
  loading?: boolean;
  error?: string;
  hasMore?: boolean;
  placeholder?: string;
  searchLabel?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();
  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    onValueChange(option.value, option.label);
    setOpen(false);
  };
  const activeIndex = Math.max(
    0,
    Math.min(active, Math.max(0, options.length - 1)),
  );
  useEffect(() => {
    if (open)
      document
        .getElementById(`${listId}-${activeIndex}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [open, listId, activeIndex]);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          id={id}
          variant="secondary"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          disabled={disabled}
          className="group w-full justify-between text-start font-normal data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/10"
        >
          <span className={cn("min-w-0 break-words", !value && "text-muted")}>
            {selectedLabel ||
              options.find((option) => option.value === value)?.label ||
              placeholder}
          </span>
          <CaretDownIcon size={16} aria-hidden className="shrink-0 transition-transform duration-200 ease-interface group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          dir="rtl"
          role="presentation"
          sideOffset={6}
          align="start"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            search.current?.focus();
          }}
          className="z-80 w-(--radix-popover-trigger-width) min-w-64 max-w-[calc(100vw-2rem)] rounded-control border border-border bg-surface p-2 shadow-overlay motion-safe:animate-fade-in"
        >
          <div className="relative">
            <MagnifyingGlassIcon
              size={17}
              aria-hidden
              className="pointer-events-none absolute start-3 top-3.5 text-primary"
            />
            <Input
              ref={search}
              type="search"
              aria-label={searchLabel}
              value={query}
              onChange={(event) => {
                onQueryChange(event.target.value);
                setActive(0);
              }}
              className="ps-9"
              aria-controls={listId}
              aria-activedescendant={
                options.length && !loading
                  ? `${listId}-${activeIndex}`
                  : undefined
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActive((index) =>
                    Math.min(Math.max(0, options.length - 1), index + 1),
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActive((index) => Math.max(0, index - 1));
                } else if (
                  event.key === "Enter" &&
                  options[activeIndex] &&
                  !loading
                ) {
                  event.preventDefault();
                  choose(options[activeIndex]);
                }
              }}
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label={searchLabel}
            className="mt-2 max-h-64 overflow-y-auto overscroll-contain"
          >
            {loading ? (
              <div
                role="status"
                aria-label="در حال جستجو"
                className="space-y-2 p-2"
              >
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
              </div>
            ) : error ? (
              <p role="alert" className="p-3 text-sm text-danger">
                {error}
              </p>
            ) : options.length ? (
              options.map((option, index) => (
                <Button
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={value === option.value}
                  tabIndex={-1}
                  disabled={option.disabled}
                  variant="ghost"
                  onPointerMove={() => setActive(index)}
                  onClick={() => choose(option)}
                  className={cn(
                    "w-full justify-start px-3 text-start font-normal",
                    activeIndex === index && "bg-primary-soft text-primary",
                  )}
                >
                  <span className="grid size-4 shrink-0 place-items-center">
                    {value === option.value && <CheckIcon size={15} aria-hidden className="motion-safe:animate-fade-in" />}
                  </span>
                  <span className="break-words">{option.label}</span>
                </Button>
              ))
            ) : (
              <p role="status" className="p-3 text-sm text-muted">
                موردی پیدا نشد.
              </p>
            )}
          </div>
          {hasMore && !loading && (
            <p className="border-t border-border px-3 pt-2 text-xs text-muted">
              برای نتایج بیشتر جستجو کنید.
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
