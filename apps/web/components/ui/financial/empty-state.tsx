import React from "react";
import { FolderSearch, Inbox, Database, CheckCircle2 } from "lucide-react";
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
        "empty-state flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-2xl border border-dashed border-border/80 bg-muted/15 space-y-4 max-w-xl mx-auto my-6",
        className
      )}
      {...props}
    >
      <div className="size-14 rounded-2xl bg-muted/60 text-muted-foreground grid place-items-center border border-border/60 shadow-2xs">
        <IconComponent className="size-7" />
      </div>

      <div className="space-y-1.5 max-w-md">
        <h3 className="text-base sm:text-lg font-bold text-foreground">{title}</h3>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>

      {(action || secondaryAction || (hasActiveFilters && onClearFilters)) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          {action && (
            <Button
              size="sm"
              onClick={action.onClick}
              className="gap-2 text-xs font-bold rounded-xl"
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
              className="text-xs font-medium rounded-xl border-border"
            >
              پاک کردن فیلترها
            </Button>
          )}

          {secondaryAction && (
            <Button
              size="sm"
              variant="ghost"
              onClick={secondaryAction.onClick}
              className="text-xs font-medium text-muted-foreground rounded-xl"
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
