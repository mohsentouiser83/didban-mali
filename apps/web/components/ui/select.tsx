"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;
const SelectGroup = SelectPrimitive.Group;

function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger className={cn("group ds-focus flex h-11 min-w-40 items-center justify-between gap-3 rounded-[var(--ds-radius-control)] border border-[var(--ds-input-border)] bg-[var(--ds-input-bg)] px-3 text-base text-[var(--ds-foreground)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--ds-primary)]", className)} {...props}>{children}<SelectPrimitive.Icon><ChevronDown className="size-4 text-[var(--ds-foreground-soft)] transition-transform duration-200 group-data-[state=open]:rotate-180" /></SelectPrimitive.Icon></SelectPrimitive.Trigger>;
}

function SelectContent({ className, children, position = "popper", ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return <SelectPrimitive.Portal><SelectPrimitive.Content dir="rtl" position={position} className={cn("z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-[var(--ds-border)] bg-[var(--ds-card-solid)] text-[var(--ds-foreground)] shadow-[var(--ds-shadow-md)]", className)} {...props}><SelectPrimitive.ScrollUpButton className="flex h-8 items-center justify-center"><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton><SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport><SelectPrimitive.ScrollDownButton className="flex h-8 items-center justify-center"><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton></SelectPrimitive.Content></SelectPrimitive.Portal>;
}

function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item className={cn("relative flex min-h-10 cursor-default select-none items-center rounded-lg py-2 ps-8 pe-3 text-sm outline-none focus:bg-[var(--ds-muted)] data-[disabled]:opacity-50", className)} {...props}><span className="absolute start-2 flex size-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="size-4 text-[var(--ds-primary)]" /></SelectPrimitive.ItemIndicator></span><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText></SelectPrimitive.Item>;
}

export { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue };
