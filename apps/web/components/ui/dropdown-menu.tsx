"use client";
import * as Primitive from "@radix-ui/react-dropdown-menu";
import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export function DropdownMenu(props: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root dir="rtl" {...props} />;
}
export const DropdownMenuTrigger = Primitive.Trigger;
export const DropdownMenuGroup = Primitive.Group;
export const DropdownMenuRadioGroup = Primitive.RadioGroup;

const itemClass = "flex min-h-11 cursor-default items-center gap-3 rounded-control px-3 py-2 text-sm outline-none transition-colors duration-200 data-highlighted:bg-primary-soft data-highlighted:text-primary data-disabled:pointer-events-none data-disabled:opacity-50 motion-reduce:transition-none";

export function DropdownMenuContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className={cn("z-80 max-h-(--radix-dropdown-menu-content-available-height) w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-panel border border-border bg-surface p-2 text-foreground shadow-overlay motion-safe:data-[state=open]:animate-fade-in", className)}
        {...props}
      />
    </Primitive.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn(itemClass, className)} {...props} />;
}
export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return <Primitive.Label className={cn("px-3 py-2 text-xs text-muted", className)} {...props} />;
}
export function DropdownMenuSeparator() {
  return <Primitive.Separator className="my-2 h-px bg-border" />;
}
export function DropdownMenuRadioItem({ children, className, ...props }: ComponentProps<typeof Primitive.RadioItem>) {
  return (
    <Primitive.RadioItem className={cn(itemClass, "relative ps-9 data-[state=checked]:font-medium data-[state=checked]:text-primary", className)} {...props}>
      <Primitive.ItemIndicator className="absolute start-3"><CheckIcon size={16} aria-hidden /></Primitive.ItemIndicator>
      {children}
    </Primitive.RadioItem>
  );
}
