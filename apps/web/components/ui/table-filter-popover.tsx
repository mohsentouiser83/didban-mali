"use client";

import { useId, useState, useMemo, type ReactNode } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "./popover";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Tooltip } from "./tooltip";
import {
  FunnelSimpleIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { cn, persian, asciiDigits } from "@/lib/utils";

import type { ColumnFilterConfig } from "./table-column-filter";

export interface TableFilterPopoverProps {
  columnTitle: string;
  getValues?: () => { value: string; count: number }[];
  activeFilter?: ColumnFilterConfig;
  onApply: (filter: ColumnFilterConfig | null) => void;
  isActive?: boolean;
  maxLength?: number;
}

export function TableFilterPanel({
  columnTitle,
  isActive,
  onOpen,
  children,
}: {
  columnTitle: string;
  isActive: boolean;
  onOpen?: () => void;
  children: (controls: { close: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={(next) => {
      if (next) onOpen?.();
      setOpen(next);
    }}>
      <Tooltip content={isActive ? "فیلتر فعال است" : `فیلتر ستون ${columnTitle}`}>
        <PopoverTrigger asChild>
          <Button
            variant={isActive ? "primary" : "ghost"}
            className={cn(
              "size-11 min-h-0 p-0 sm:size-7",
              isActive ? "shadow-none" : "[&>svg]:text-primary hover:[&>svg]:text-primary-hover"
            )}
            aria-label={`فیلتر ستون ${columnTitle}`}
            aria-pressed={isActive}
          >
            <FunnelSimpleIcon size={14} weight={isActive ? "fill" : "regular"} />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent aria-label={`فیلتر ستون ${columnTitle}`} align="end" className="w-72 max-w-[calc(100vw-2rem)] space-y-3 p-3 text-xs">
        {children({ close: () => setOpen(false) })}
      </PopoverContent>
    </Popover>
  );
}

export function TableFilterPopover({
  columnTitle,
  getValues,
  activeFilter,
  onApply,
  isActive = false,
  maxLength,
}: TableFilterPopoverProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const textId = useId();
  const [uniqueValues, setUniqueValues] = useState<ReturnType<NonNullable<typeof getValues>>>([]);
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const [textCondition, setTextCondition] = useState(activeFilter?.textCondition || "");

  const loadFilter = () => {
    const values = getValues?.() ?? [];
    setUniqueValues(values);
    setSelectedValues(new Set(activeFilter?.selectedValues ?? values.map(({ value }) => value)));
    setTextCondition(activeFilter?.textCondition || "");
    setSearchTerm("");
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

  const apply = () => {
    const hasUncheckedValues = uniqueValues.some(({ value }) => !selectedValues.has(value)) ||
      (!!activeFilter?.selectedValues && uniqueValues.length === 0);
    const text = textCondition.trim();
    onApply(hasUncheckedValues || text ? {
      selectedValues: hasUncheckedValues ? selectedValues : undefined,
      textCondition: text || undefined,
    } : null);
  };

  return (
    <TableFilterPanel columnTitle={columnTitle} isActive={isActive} onOpen={loadFilter}>
      {({ close }) => (
        <>
        {/* Text Condition Filter */}
        <div className="space-y-1">
          <label htmlFor={textId} className="text-xs text-muted">شامل متن</label>
          <Input
            id={textId}
            value={textCondition}
            maxLength={maxLength}
            onChange={(e) => setTextCondition(e.target.value)}
            className="text-xs"
          />
        </div>

        {/* Value Checklist */}
        {uniqueValues.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted">مقادیر</span>
              <Button
                variant="ghost"
                onClick={toggleSelectAll}
                className="h-8 min-h-0 px-2 text-xs text-primary"
              >
                {allSelected ? "عدم انتخاب همه" : "انتخاب همه"}
              </Button>
            </div>

            {/* Quick search inside values */}
            {uniqueValues.length > 5 && (
              <div className="relative">
                <Input
                  aria-label="جست‌وجو در مقادیر ستون"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="جستجو در مقادیر..."
                  className="pe-8 text-xs"
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
                    <div key={value} className="flex items-center justify-between gap-2 text-xs">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => handleToggleValue(value)}
                        label={value || "خالی"}
                      />
                      <span className="pe-2 text-xs text-muted tabular-nums">{persian(count)}</span>
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
            onClick={() => { onApply(null); close(); }}
            className="h-7 px-2 text-[11px] text-muted hover:text-danger"
          >
            پاک‌کردن
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              onClick={close}
              className="h-7 px-2.5 text-[11px]"
            >
              انصراف
            </Button>
            <Button
              variant="primary"
              onClick={() => { apply(); close(); }}
              className="h-7 px-3 text-[11px]"
            >
              اعمال
            </Button>
          </div>
        </div>
        </>
      )}
    </TableFilterPanel>
  );
}
