import React, { useState } from "react";
import { Search, SlidersHorizontal, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/date-utils";

export interface FilterBarProps extends React.HTMLAttributes<HTMLDivElement> {
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  primaryFilters?: React.ReactNode;
  advancedFilters?: React.ReactNode;
  activeFilterCount?: number;
  onClearAll?: () => void;
  actions?: React.ReactNode;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "جستجو...",
  primaryFilters,
  advancedFilters,
  activeFilterCount = 0,
  onClearAll,
  actions,
  className,
  ...props
}: FilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className={cn("filter-bar space-y-2.5", className)} {...props}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search Input */}
          {onSearchChange !== undefined && (
            <div className="relative min-w-[200px] max-w-xs flex-1">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                value={searchValue || ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="ps-8 pe-8 h-8 text-xs bg-card rounded-xl border-border"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                  <span className="sr-only">پاک کردن جستجو</span>
                </button>
              )}
            </div>
          )}

          {/* Primary Filters (Selects / Quick Toggles) */}
          {primaryFilters}

          {/* Advanced Filters Toggle */}
          {advancedFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={cn(
                "h-8 gap-1.5 text-xs rounded-xl border-border",
                showAdvanced && "bg-accent text-primary border-primary/40"
              )}
            >
              <SlidersHorizontal className="size-3.5" />
              <span>فیلترهای بیشتر</span>
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="px-1.5 py-0 text-[10px] font-bold bg-primary/10 text-primary border-0"
                >
                  {toPersianDigits(activeFilterCount)}
                </Badge>
              )}
            </Button>
          )}

          {/* Clear All Filters Button */}
          {activeFilterCount > 0 && onClearAll && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-destructive rounded-xl px-2"
            >
              <RotateCcw className="size-3" />
              <span>پاک‌کردن فیلترها</span>
            </Button>
          )}
        </div>

        {/* Right side actions (e.g. Export / View toggles) */}
        {actions && <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">{actions}</div>}
      </div>

      {/* Advanced Filter Collapse Area */}
      {showAdvanced && advancedFilters && (
        <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 flex flex-wrap items-center gap-3 animate-in fade-in-50 duration-150">
          {advancedFilters}
        </div>
      )}
    </div>
  );
}
