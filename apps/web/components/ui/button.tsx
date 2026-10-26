import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
export function cx(...items: (string | false | null | undefined)[]) {
  return items.filter(Boolean).join(" ");
}
export function Button({
  className,
  variant = "primary",
  asChild = false,
  type = "button",
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  asChild?: boolean;
}) {
  const Tag = asChild ? Slot.Root : "button";
  return (
    <Tag
      type={asChild ? undefined : type}
      className={cx(
        "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-medium transition-[color,background-color,box-shadow,transform] duration-200 ease-smooth focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50 motion-safe:active:scale-[.96] motion-reduce:transition-none",
        variant === "primary" &&
          "bg-primary text-white shadow-sm hover:bg-primary-hover",
        variant === "secondary" &&
          "border border-border bg-surface hover:bg-background",
        variant === "ghost" && "text-muted hover:bg-accent hover:text-primary",
        variant === "danger" && "bg-danger text-white hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}
