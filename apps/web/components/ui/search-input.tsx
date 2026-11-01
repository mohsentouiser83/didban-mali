"use client";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useId, type ComponentProps } from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";
export function SearchInput({ label, className, id, ...props }: ComponentProps<typeof Input> & { label: string }) {
  const generated = useId();
  const inputId = id || generated;
  return <div className={cn("relative", className)}><label htmlFor={inputId} className="sr-only">{label}</label><MagnifyingGlassIcon size={18} aria-hidden className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-primary" /><Input {...props} id={inputId} type="search" placeholder={label} className="ps-10" /></div>;
}
