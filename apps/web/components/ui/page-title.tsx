"use client";
import type { Icon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function PageTitle({ children, icon: Icon, className }: {
  children: React.ReactNode;
  icon: Icon;
  className?: string;
}) {
  return (
    <h1 className={cn("flex min-w-0 items-center gap-2.5 font-display text-page font-medium leading-relaxed", className)}>
      <Icon size={24} weight="duotone" className="shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 break-words">{children}</span>
    </h1>
  );
}
