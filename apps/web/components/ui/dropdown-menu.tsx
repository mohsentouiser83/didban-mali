"use client";
import { DropdownMenu as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cx } from "./button";

export function DropdownMenu(props: ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root dir="rtl" {...props} />;
}
export const DropdownMenuTrigger = Primitive.Trigger;
export function DropdownMenuContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className={cx(
          "z-60 max-h-[min(70vh,480px)] min-w-48 max-w-[calc(100vw-32px)] overflow-auto rounded-panel border border-border bg-surface p-2 shadow-float motion-safe:animate-dialog",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cx(
        "flex min-h-11 items-center gap-2 rounded-control px-3 text-sm outline-none transition-colors duration-200 data-[highlighted]:bg-accent data-[highlighted]:text-primary data-[disabled]:opacity-50 motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}
