"use client";

import { cn } from "@/lib/utils";
import {
  formatDateInput,
  isoDate,
  isoToJalali,
  jalaliToIso,
  toGregorianIso,
} from "@/lib/date-utils";
import { DayPicker } from "@daypicker/persian";
import {
  CalendarBlankIcon,
  CaretLeftIcon,
  CaretRightIcon,
} from "@phosphor-icons/react";
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./button";
import { controlClass } from "./input";

export interface PersianDatePickerProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  minExclusive?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
  name?: string;
}

export function PersianDatePicker({
  id,
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  placeholder = "1403/01/01",
  minExclusive,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-required": ariaRequired,
  name,
}: PersianDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);

  const initialText = isoToJalali(value);
  const [text, setText] = useState(initialText);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      setText(isoToJalali(value));
    }
  }, [value]);

  const currentIso = toGregorianIso(value);
  const parsed = currentIso ? new Date(currentIso + "T12:00:00") : undefined;
  const selected =
    parsed && !Number.isNaN(parsed.getTime()) && isoDate(parsed) === currentIso
      ? parsed
      : undefined;

  const [attempted, setAttempted] = useState(false);
  const reqId = useId();
  const errorId = `${reqId}-error`;
  const isRequiredInvalid = Boolean(required && !selected && attempted);
  const isInvalid = Boolean(ariaInvalid || isRequiredInvalid);
  const describedBy = [
    ariaDescribedBy,
    isRequiredInvalid ? errorId : null,
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const formatted = formatDateInput(raw, text);
    setText(formatted);

    if (!formatted) {
      prevValueRef.current = "";
      onChange("");
      return;
    }

    const iso = jalaliToIso(formatted);
    if (iso) {
      prevValueRef.current = iso;
      onChange(iso);
    }
  };

  const handleBlur = () => {
    if (!text) {
      if (value) {
        prevValueRef.current = "";
        onChange("");
      }
      return;
    }

    const iso = jalaliToIso(text);
    if (iso) {
      const canonical = isoToJalali(iso);
      setText(canonical);
      if (iso !== value) {
        prevValueRef.current = iso;
        onChange(iso);
      }
    } else {
      setText(isoToJalali(value));
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if ((event.altKey && event.key === "ArrowDown") || event.key === "F4") {
      event.preventDefault();
      setOpen((prev) => !prev);
    }
  };

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Anchor asChild>
          <div
            ref={setWrapEl}
            className={cn("relative flex items-center w-full min-w-0", className)}
          >
            <input
              id={id}
              name={name}
              ref={setInputEl}
              type="text"
              inputMode="numeric"
              dir="ltr"
              autoComplete="off"
              disabled={disabled}
              placeholder={placeholder}
              value={text}
              aria-label={label || "تاریخ"}
              aria-invalid={isInvalid || undefined}
              aria-describedby={describedBy}
              aria-required={required || ariaRequired || undefined}
              className={cn(
                controlClass,
                "w-full pr-3 pl-10 text-right [direction:ltr] tabular-nums tracking-[0.5px]",
              )}
              onChange={handleInputChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
            />
            <Popover.Trigger asChild>
              <button
                type="button"
                tabIndex={-1}
                disabled={disabled}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary-soft cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`انتخاب تاریخ ${label || ""}`.trim()}
                title="انتخاب از تقویم"
              >
                <CalendarBlankIcon size={18} aria-hidden />
              </button>
            </Popover.Trigger>
          </div>
        </Popover.Anchor>
        <Popover.Portal container={wrapEl?.closest("dialog") ?? undefined}>
          <Popover.Content
            dir="rtl"
            aria-label={label || "تقویم انتخاب تاریخ"}
            sideOffset={8}
            align="start"
            collisionPadding={8}
            className="z-80 w-auto rounded-panel border border-border bg-surface p-3 shadow-overlay motion-safe:animate-fade-in"
          >
            <DayPicker
              mode="single"
              dir="rtl"
              autoFocus
              selected={selected}
              defaultMonth={selected}
              disabled={(date) => !!minExclusive && isoDate(date) <= minExclusive}
              onSelect={(date: Date | undefined) => {
                const newIso = date ? isoDate(date) : "";
                const newJalali = newIso ? isoToJalali(newIso) : "";
                prevValueRef.current = newIso;
                setText(newJalali);
                onChange(newIso);
                setOpen(false);
              }}
              components={{
                Chevron: ({ orientation }) =>
                  orientation === "left" ? (
                    <CaretLeftIcon size={18} aria-hidden />
                  ) : (
                    <CaretRightIcon size={18} aria-hidden />
                  ),
                PreviousMonthButton: ({ className, ...props }) => (
                  <Button
                    {...props}
                    variant="ghost"
                    type="button"
                    className={cn("size-9 min-h-9 p-0 pointer-events-auto", className)}
                  />
                ),
                NextMonthButton: ({ className, ...props }) => (
                  <Button
                    {...props}
                    variant="ghost"
                    type="button"
                    className={cn("size-9 min-h-9 p-0 pointer-events-auto", className)}
                  />
                ),
              }}
              classNames={{
                months: "relative",
                month: "w-full space-y-3",
                month_caption:
                  "flex h-10 items-center justify-center px-10 text-sm font-medium",
                nav: "absolute inset-x-0 top-0 flex justify-between pointer-events-none",
                month_grid: "w-full border-collapse",
                weekdays: "flex justify-around mb-1",
                weekday: "w-9 text-center text-xs font-normal text-muted",
                week: "flex justify-around mt-1",
                day: "size-9 text-center p-0",
                day_button: cn(
                  "size-9 rounded-control text-xs flex items-center justify-center outline-none transition-colors",
                  "hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary pointer-events-auto",
                ),
                selected: "rounded-control bg-primary text-white font-medium hover:bg-primary",
                today: "font-bold text-primary",
                outside: "text-muted opacity-40",
                disabled: "opacity-30 pointer-events-none cursor-not-allowed",
              }}
            />
            {!required && (value || text) && (
              <Button
                variant="ghost"
                type="button"
                className="mt-2 w-full text-xs text-muted hover:text-foreground"
                onClick={() => {
                  prevValueRef.current = "";
                  setText("");
                  onChange("");
                  setOpen(false);
                }}
              >
                پاک کردن تاریخ
              </Button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {required && (
        <input
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          required
          value={selected ? value : ""}
          onChange={() => {}}
          onInvalid={(event) => {
            event.preventDefault();
            setAttempted(true);
            if (
              event.currentTarget.form?.querySelector(
                "input:invalid, textarea:invalid, select:invalid",
              ) === event.currentTarget
            ) {
              inputEl?.focus();
            }
          }}
        />
      )}
      {isRequiredInvalid && (
        <p className="text-xs text-danger mt-1" id={errorId} role="alert">
          یک تاریخ انتخاب کنید.
        </p>
      )}
    </>
  );
}

export const DateInput = PersianDatePicker;
export type DateInputProps = PersianDatePickerProps;
