"use client";

import { cn } from "@/lib/utils";
import React, { useRef } from "react";

export interface TabItem<T extends string = string> {
  id: T;
  label: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  variant?: "segmented" | "underline";
  size?: "sm" | "md";
  ariaLabel?: string;
}

export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  className,
  variant = "segmented",
  size = "md",
  ariaLabel,
}: TabsProps<T>) {
  const tablistRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabledItems = items.filter((item) => !item.disabled);
    const currentIndex = enabledItems.findIndex((item) => item.id === items[index]?.id);
    if (currentIndex === -1) return;

    let targetItem: TabItem<T> | undefined;

    // In RTL, ArrowRight moves to previous in DOM, ArrowLeft moves to next in DOM.
    // However, handling both standard arrow keys:
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % enabledItems.length;
      targetItem = enabledItems[nextIndex];
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
      targetItem = enabledItems[prevIndex];
    } else if (event.key === "Home") {
      event.preventDefault();
      targetItem = enabledItems[0];
    } else if (event.key === "End") {
      event.preventDefault();
      targetItem = enabledItems[enabledItems.length - 1];
    }

    if (targetItem) {
      onChange(targetItem.id);
      const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])');
      const targetBtn = Array.from(buttons || []).find(
        (btn) => btn.getAttribute("data-tab-id") === targetItem?.id,
      );
      targetBtn?.focus();
    }
  };

  if (variant === "underline") {
    return (
      <div
        ref={tablistRef}
        role="tablist"
        aria-label={ariaLabel}
        className={cn("flex items-center gap-4 border-b border-border/80 pb-px overflow-x-auto scrollbar-none", className)}
      >
        {items.map((item, index) => {
          const isSelected = item.id === value;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              role="tab"
              type="button"
              id={`tab-${item.id}`}
              data-tab-id={item.id}
              aria-selected={isSelected}
              aria-controls={`panel-${item.id}`}
              tabIndex={isSelected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => onChange(item.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={cn(
                "group relative inline-flex shrink-0 items-center gap-2 border-b-2 px-3 pb-3 pt-2 text-sm font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-40",
                isSelected
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted hover:border-border hover:text-foreground",
                size === "sm" && "pb-2 pt-1 text-xs",
              )}
            >
              {Icon && (
                <Icon
                  size={size === "sm" ? 16 : 18}
                  aria-hidden
                  className={cn(
                    "transition-colors",
                    isSelected ? "text-primary" : "text-muted group-hover:text-foreground",
                  )}
                />
              )}
              <span>{item.label}</span>
              {item.badge && (
                <span className="inline-flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Segmented Pill Variant (Default)
  return (
    <div
      ref={tablistRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-control border border-border bg-canvas/90 p-1 text-xs",
        className,
      )}
    >
      {items.map((item, index) => {
        const isSelected = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            id={`tab-${item.id}`}
            data-tab-id={item.id}
            aria-selected={isSelected}
            aria-controls={`panel-${item.id}`}
            tabIndex={isSelected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-md font-medium transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-40",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-xs sm:text-sm",
              isSelected
                ? "bg-surface text-primary shadow-xs ring-1 ring-border/50 font-semibold"
                : "text-muted hover:bg-surface/50 hover:text-foreground",
            )}
          >
            {Icon && (
              <Icon
                size={size === "sm" ? 14 : 16}
                aria-hidden
                className={cn(
                  "transition-colors",
                  isSelected ? "text-primary" : "text-muted",
                )}
              />
            )}
            <span>{item.label}</span>
            {item.badge && (
              <span className="inline-flex items-center justify-center">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
