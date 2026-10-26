"use client";
import { Popover as Primitive } from "radix-ui";
import type { ReactNode } from "react";
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Trigger asChild>{trigger}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          dir="rtl"
          align="end"
          sideOffset={8}
          collisionPadding={20}
          className="z-60 max-w-[calc(100vw-40px)] rounded-panel border border-border bg-surface p-3 shadow-float motion-safe:animate-dialog"
        >
          {children}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
