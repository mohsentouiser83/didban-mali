"use client";

import { forwardRef, useId, type ComponentProps } from "react";
import { Input } from "./input";
import { Search } from "./icons";
import { cn } from "@/lib/utils";

/** Shared single-line search control, including its accessible label and decorative icon. */
export const SearchInput = forwardRef<HTMLInputElement, Omit<ComponentProps<typeof Input>, "size"> & { label: string }>(({ label, className, id, ...props }, ref) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return <div data-slot="search-field" className={cn("relative min-w-0", className)}>
    <label htmlFor={inputId} className="sr-only">{label}</label>
    <Search size={18} aria-hidden="true" className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-primary/75" />
    <Input ref={ref} id={inputId} {...props} aria-label={label} size="default" className="ps-11" />
  </div>;
});
SearchInput.displayName = "SearchInput";
