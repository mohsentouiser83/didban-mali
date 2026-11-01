"use client";
import { cn, displayDate, isoDate } from "@/lib/utils";
import { DayPicker } from "@daypicker/persian";
import {
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useRef } from "react";
import type { DayButtonProps } from "react-day-picker";
import { Button } from "./button";
export function PersianDatePicker({
  id,
  value,
  onChange,
  label,
  disabled = false,
  minExclusive,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  minExclusive?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const selected = value ? new Date(value + "T12:00:00") : undefined;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          id={id}
          variant="secondary"
          disabled={disabled}
          aria-label={label}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className="w-full justify-between text-start font-normal data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/10"
        >
          <span className={value ? "" : "text-muted"}>
            {value ? displayDate(value) : "انتخاب تاریخ"}
          </span>
          <CalendarBlankIcon size={18} aria-hidden className="text-primary" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          dir="rtl"
          sideOffset={8}
          className="z-80 rounded-panel border border-border bg-surface p-4 shadow-overlay motion-safe:animate-fade-in"
        >
          <DayPicker
            mode="single"
            disabled={(date) => !!minExclusive && isoDate(date) <= minExclusive}
            selected={selected}
            onSelect={(date) => onChange(date ? isoDate(date) : "")}
            dir="rtl"
            components={{
              Chevron: ({ orientation }) =>
                orientation === "left" ? (
                  <CaretLeftIcon size={18} />
                ) : (
                  <CaretRightIcon size={18} />
                ),
              DayButton: CalendarDayButton,
              NextMonthButton: ({ className, ...props }) => (
                <Button
                  {...props}
                  variant="ghost"
                  className={cn("size-10 min-h-10 p-0", className)}
                />
              ),
              PreviousMonthButton: ({ className, ...props }) => (
                <Button
                  {...props}
                  variant="ghost"
                  className={cn("size-10 min-h-10 p-0", className)}
                />
              ),
            }}
            classNames={{
              months: "relative",
              month: "space-y-3",
              month_caption:
                "flex h-11 items-center justify-center px-12 font-medium",
              nav: "absolute inset-x-0 top-0 flex justify-between",
              month_grid: "w-full border-collapse",
              weekdays: "flex",
              weekday: "w-10 py-2 text-xs font-normal text-muted",
              week: "mt-1 flex",
              day: "size-10 text-center",
              day_button:
                "size-10 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-primary hover:bg-primary-soft",
              selected: "rounded-control bg-primary text-white",
              today: "font-medium text-primary",
              outside: "text-muted opacity-40",
              disabled: "opacity-30",
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function CalendarDayButton({ day, modifiers, ...props }: DayButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  return (
    <Button
      {...props}
      ref={ref}
      variant="ghost"
      className={cn(
        "size-10 min-h-10 p-0 font-normal",
        modifiers.selected && "bg-primary text-white hover:bg-primary-hover",
        props.className,
      )}
      data-day={day.date.toISOString()}
    />
  );
}
