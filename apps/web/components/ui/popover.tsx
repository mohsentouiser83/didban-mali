"use client";
import * as Primitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverClose = Primitive.Close;
export function PopoverContent({
  className,
  align = "end",
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        dir="rtl"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-80 max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-panel border border-border bg-surface p-4 text-foreground shadow-overlay outline-none motion-safe:data-[state=open]:animate-fade-in",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
