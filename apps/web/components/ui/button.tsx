"use client";
import { cn } from "@/lib/utils";
import { CircleNotchIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes } from "react";
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "soft";
  busy?: boolean;
};
export const buttonClass = (variant: ButtonProps["variant"] = "primary") =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform,scale] duration-200 ease-interface outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&[aria-busy=true]>svg:not([data-spinner])]:hidden enabled:cursor-pointer motion-safe:active:scale-[0.96] motion-reduce:transition-none",
    {
      "bg-primary text-white hover:bg-primary-hover hover:shadow-md hover:shadow-primary/20 shadow-action":
        variant === "primary",
      "[&>svg]:text-primary border border-border bg-surface text-foreground hover:border-primary/30 hover:bg-canvas":
        variant === "secondary",
      "[&>svg]:text-primary text-muted hover:bg-canvas hover:text-foreground":
        variant === "ghost",
      "bg-danger-soft text-danger hover:bg-danger hover:text-white":
        variant === "danger",
      "bg-primary-soft text-primary hover:bg-primary/15": variant === "soft",
    },
  );
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant = "primary",
      busy,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        className={cn(buttonClass(variant), className)}
      >
        {busy && (
          <CircleNotchIcon
            data-spinner
            aria-hidden
            className="size-4 animate-spin motion-reduce:animate-none"
          />
        )}
        {children}
      </button>
    );
  },
);
export function ButtonLink({
  href,
  children,
  variant = "primary",
  className,
  onClick,
  target,
  rel,
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  target?: React.HTMLAttributeAnchorTarget;
  rel?: string;
}) {
  return (
    <Link
      onClick={onClick}
      href={href}
      target={target}
      rel={target === "_blank" ? "noopener noreferrer" : rel}
      prefetch={target === "_blank" ? false : undefined}
      className={cn(
        buttonClass(variant),
        "cursor-pointer motion-safe:active:scale-[0.96]",
        className,
      )}
    >
      {children}
    </Link>
  );
}
