import React from "react";
import {
  FolderSearch,
  Inbox,
  Database,
  CheckCircle2,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
    icon?: React.ComponentType<{ className?: string }>;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
}

export function EmptyState({
  icon: IconComponent = Inbox,
  title,
  description,
  action,
  secondaryAction,
  hasActiveFilters = false,
  onClearFilters,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "empty-state group flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-[var(--ds-card-radius)] border border-dashed border-border/80 bg-muted/15 space-y-4 max-w-xl mx-auto my-6 hover:border-primary/40 hover:bg-muted/25 transition-all duration-200",
        className,
      )}
      {...props}
    >
      <div className="size-14 rounded-[var(--ds-card-radius)]  text-muted-foreground grid place-items-center    transition-transform duration-300   group-hover:text-primary ">
        <IconComponent className="size-7" />
      </div>

      <div className="space-y-1.5 max-w-md">
        <h3 className="text-base sm:text-lg font-bold text-foreground">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>

      {(action || secondaryAction || (hasActiveFilters && onClearFilters)) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          {action && (
            <Button
              size="sm"
              onClick={action.onClick}
              className="gap-2"
              asChild={Boolean(action.href)}
            >
              {action.href ? (
                <a href={action.href}>
                  {action.icon && <action.icon className="size-3.5" />}
                  {action.label}
                </a>
              ) : (
                <>
                  {action.icon && <action.icon className="size-3.5" />}
                  {action.label}
                </>
              )}
            </Button>
          )}

          {hasActiveFilters && onClearFilters && (
            <Button
              size="sm"
              variant="outline"
              onClick={onClearFilters}
              className=""
            >
              پاک کردن فیلترها
            </Button>
          )}

          {secondaryAction && (
            <Button
              size="sm"
              variant="ghost"
              onClick={secondaryAction.onClick}
              className="text-muted-foreground"
              asChild={Boolean(secondaryAction.href)}
            >
              {secondaryAction.href ? (
                <a href={secondaryAction.href}>{secondaryAction.label}</a>
              ) : (
                secondaryAction.label
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
