import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { Inbox } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ComponentType<{ className?: string }>;
  title?: string;
  description?: string;
  variant?: "panel" | "compact" | "inline";
  action?: { label: string; onClick?: () => void; href?: string; icon?: ComponentType<{ className?: string }> };
  secondaryAction?: { label: string; onClick?: () => void; href?: string };
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}

export function EmptyState({ icon: Icon = Inbox, title, description, variant = "panel", action, secondaryAction, hasActiveFilters = false, onClearFilters, children, className, ...props }: EmptyStateProps) {
  return <div role="status" data-slot="empty-state" data-variant={variant} className={cn(
    "min-w-0 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]",
    variant === "panel" && "mx-auto my-6 flex w-full max-w-xl flex-col items-center gap-4 rounded-[var(--ds-card-radius)] border border-dashed border-border bg-muted/15 p-6 text-center sm:p-8",
    variant === "compact" && "flex flex-col items-center justify-center gap-3 px-4 py-6 text-center",
    variant === "inline" && "flex flex-wrap items-center gap-2 py-1",
    className,
  )} {...props}>
    {variant !== "inline" && <Icon className="size-7 shrink-0 text-muted-foreground" aria-hidden="true" />}
    {title && <h3 className="text-sm font-medium text-foreground">{title}</h3>}
    {description && <p>{description}</p>}
    {children}
    {(action || secondaryAction || (hasActiveFilters && onClearFilters)) && <div className="flex flex-wrap items-center justify-center gap-2">
      {action && <StateAction action={action} />}
      {hasActiveFilters && onClearFilters && <Button variant="outline" onClick={onClearFilters}>پاک کردن فیلترها</Button>}
      {secondaryAction && <StateAction action={secondaryAction} secondary />}
    </div>}
  </div>;
}
function StateAction({ action, secondary = false }: { action: NonNullable<EmptyStateProps["action"]>; secondary?: boolean }) {
  const content: ReactNode = <>{action.icon && <action.icon className="size-4" aria-hidden="true" />}{action.label}</>;
  return <Button variant={secondary ? "outline" : "default"} onClick={action.onClick} asChild={!!action.href}>{action.href ? <Link href={action.href}>{content}</Link> : content}</Button>;
}
