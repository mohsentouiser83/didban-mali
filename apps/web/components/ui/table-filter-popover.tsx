"use client";

import { useState, useMemo } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { Button } from "./button";
import { Tooltip } from "./tooltip";
import {
  FunnelSimpleIcon,
  MagnifyingGlassIcon,
  CheckIcon,
} from "@phosphor-icons/react";
import { cn, persian, asciiDigits } from "@/lib/utils";

export interface ColumnFilterConfig {
  selectedValues?: Set<string>;
  textCondition?: string;
}

export interface TableFilterPopoverProps {
  columnIndex: number;
  columnTitle: string;
  uniqueValues: { value: string; count: number }[];
  activeFilter?: ColumnFilterConfig;
  onApply: (filter: ColumnFilterConfig | null) => void;
  isActive?: boolean;
}

export function TableFilterPopover({
  columnTitle,
  uniqueValues,
  activeFilter,
  onApply,
  isActive = false,
}: TableFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedValues, setSelectedValues] = useState<Set<string>>(() => {
    return activeFilter?.selectedValues
      ? new Set(activeFilter.selectedValues)
      : new Set(uniqueValues.map((v) => v.value));
  });
  const [textCondition, setTextCondition] = useState(activeFilter?.textCondition || "");

  // When popover opens, synchronize with currently active filter
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      if (activeFilter?.selectedValues) {
        setSelectedValues(new Set(activeFilter.selectedValues));
      } else {
        setSelectedValues(new Set(uniqueValues.map((v) => v.value)));
      }
      setTextCondition(activeFilter?.textCondition || "");
      setSearchTerm("");
    }
    setOpen(nextOpen);
  };

  const filteredValues = useMemo(() => {
    if (!searchTerm.trim()) return uniqueValues;
    const normSearch = asciiDigits(searchTerm.toLowerCase().trim());
    return uniqueValues.filter((v) =>
      asciiDigits(v.value.toLowerCase()).includes(normSearch)
    );
  }, [uniqueValues, searchTerm]);

  const allSelected = filteredValues.length > 0 && filteredValues.every((v) => selectedValues.has(v.value));

  const toggleSelectAll = () => {
    const next = new Set(selectedValues);
    if (allSelected) {
      filteredValues.forEach((v) => next.delete(v.value));
    } else {
      filteredValues.forEach((v) => next.add(v.value));
    }
    setSelectedValues(next);
  };

  const handleToggleValue = (val: string) => {
    const next = new Set(selectedValues);
    if (next.has(val)) {
      next.delete(val);
    } else {
      next.add(val);
    }
    setSelectedValues(next);
  };

  const handleApply = () => {
    // If all values are selected and no text condition, filter is effectively null
    const hasUncheckedValues = selectedValues.size < uniqueValues.length;
    const hasText = textCondition.trim().length > 0;

    if (!hasUncheckedValues && !hasText) {
      onApply(null);
    } else {
      onApply({
        selectedValues: hasUncheckedValues ? selectedValues : undefined,
        textCondition: hasText ? textCondition.trim() : undefined,
      });
    }
    setOpen(false);
  };

  const handleClear = () => {
    setSelectedValues(new Set(uniqueValues.map((v) => v.value)));
    setTextCondition("");
    onApply(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip content={isActive ? "فیلتر فعال است (کلیک برای ویرایش)" : `فیلتر ستون ${columnTitle}`}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "relative size-6 rounded flex items-center justify-center transition-colors cursor-pointer",
              isActive
                ? "bg-primary text-white shadow-xs hover:bg-primary-hover"
                : "text-muted/70 hover:text-foreground hover:bg-black/5"
            )}
            aria-label={`فیلتر ستون ${columnTitle}`}
            aria-expanded={open}
          >
            <FunnelSimpleIcon size={14} weight={isActive ? "fill" : "regular"} />
            {isActive && (
              <span className="absolute -top-0.5 -end-0.5 size-2 rounded-full bg-emerald ring-2 ring-surface" />
            )}
          </button>
        </PopoverTrigger>
      </Tooltip>

      <PopoverContent align="end" className="w-72 p-3 space-y-3 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <span className="font-medium text-foreground">فیلتر: {columnTitle}</span>
          {isActive && (
            <span className="rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-medium text-primary">
              فعال
            </span>
          )}
        </div>

        {/* Text Condition Filter */}
        <div className="space-y-1">
          <label className="text-[11px] text-muted">شامل متن:</label>
          <input
            type="text"
            value={textCondition}
            onChange={(e) => setTextCondition(e.target.value)}
            placeholder="جستجوی متنی در این ستون..."
            className="w-full rounded-md border border-border bg-canvas/40 px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Value Checklist */}
        {uniqueValues.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted">انتخاب مقادیر:</span>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-primary hover:underline"
              >
                {allSelected ? "عدم انتخاب همه" : "انتخاب همه"}
              </button>
            </div>

            {/* Quick search inside values */}
            {uniqueValues.length > 5 && (
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="جستجو در مقادیر..."
                  className="w-full rounded-md border border-border bg-canvas/40 pe-7 ps-2 py-1 text-xs text-foreground placeholder:text-muted/60 focus:border-primary focus:outline-none"
                />
                <MagnifyingGlassIcon className="absolute end-2 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
              </div>
            )}

            {/* Scrollable list */}
            <div className="max-h-40 overflow-y-auto rounded-md border border-border/60 bg-canvas/20 p-1 space-y-0.5">
              {filteredValues.length ? (
                filteredValues.map(({ value, count }) => {
                  const isChecked = selectedValues.has(value);
                  return (
                    <div
                      key={value}
                      onClick={() => handleToggleValue(value)}
                      className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-canvas cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={cn(
                            "grid size-4 place-items-center rounded border border-border transition-colors",
                            isChecked ? "bg-primary border-primary text-white" : "bg-surface"
                          )}
                        >
                          {isChecked && <CheckIcon size={12} weight="bold" />}
                        </div>
                        <span className="truncate text-foreground text-[11px]">
                          {value || "— (خالی)"}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted font-mono tabular-nums ms-2">
                        {persian(count)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="py-3 text-center text-[11px] text-muted">
                  موردی یافت نشد
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between border-t border-border/60 pt-2">
          <Button
            variant="ghost"
            onClick={handleClear}
            className="h-7 px-2 text-[11px] text-muted hover:text-danger"
          >
            پاک‌کردن
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              className="h-7 px-2.5 text-[11px]"
            >
              انصراف
            </Button>
            <Button
              variant="primary"
              onClick={handleApply}
              className="h-7 px-3 text-[11px]"
            >
              اعمال
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
