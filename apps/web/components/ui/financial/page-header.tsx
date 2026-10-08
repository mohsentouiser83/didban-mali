import React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  periodSelector?: React.ReactNode;
  statusMetadata?: React.ReactNode;
  breadcrumb?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  badge,
  primaryAction,
  secondaryActions,
  periodSelector,
  statusMetadata,
  breadcrumb,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "page-header flex flex-col gap-4 border-b border-border/70 pb-5 pt-1",
        className
      )}
      {...props}
    >
      {breadcrumb && <div className="text-xs text-muted-foreground">{breadcrumb}</div>}

      <div className="page-header-row flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Title and Description Area */}
        <div className="page-header-copy space-y-1.5 min-w-0">
          <div className="page-header-title-row flex flex-wrap items-center gap-2.5">
            <h1 className="page-header-title font-[family-name:var(--font-display)] text-[30px] font-bold text-foreground tracking-normal leading-tight">
              {title}
            </h1>
            {badge && <div className="page-header-badge shrink-0">{badge}</div>}
          </div>
          {description && (
            <p className="page-header-description text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-3xl">
              {description}
            </p>
          )}
          {statusMetadata && (
            <div className="page-header-status flex items-center gap-3 pt-1 text-xs text-muted-foreground">
              {statusMetadata}
            </div>
          )}
        </div>

        {/* Action Controls Area */}
        {(periodSelector || secondaryActions || primaryAction) && (
          <div className="page-header-actions flex flex-wrap items-center gap-2.5 shrink-0 self-start md:self-center">
            {periodSelector && <div className="page-header-action-group shrink-0">{periodSelector}</div>}
            {secondaryActions && <div className="page-header-action-group flex items-center gap-2">{secondaryActions}</div>}
            {primaryAction && <div className="page-header-action-group shrink-0">{primaryAction}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
