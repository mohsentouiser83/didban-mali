"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DayPicker, getDateLib } from "@daypicker/persian";
import { CalendarBlank } from "@phosphor-icons/react";
import { Input, type InputProps } from "./input";
import { Button } from "./button";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./popover";
import { dateFromISO, dateToISO, formatPersianDate, parsePersianDate } from "@/lib/persian-date";
import "react-day-picker/style.css";
import "./persian-date-picker.css";

type PersianDatePickerProps = Omit<InputProps, "type" | "value" | "defaultValue" | "onChange" | "min" | "max"> & {
  /** Gregorian YYYY-MM-DD, matching the API's date-only contract. */
  value: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
};

const calendar = getDateLib();

export function PersianDatePicker({ value, onValueChange, min, max, id, name,
  disabled, readOnly, required, size, className, onBlur, onKeyDown,
  "aria-label": ariaLabel, ...props }: PersianDatePickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ source: value, text: formatPersianDate(value) });
  const selected = dateFromISO(value);
  const text = draft.source === value ? draft.text : formatPersianDate(value);
  const parsed = parsePersianDate(text);
  const iso = parsed ? dateToISO(parsed) : "";
  const error = text && !parsed ? "تاریخ شمسی معتبر وارد کنید؛ مانند ۱۴۰۵/۰۱/۰۱."
    : iso && min && iso < min ? `تاریخ باید از ${formatPersianDate(min)} به بعد باشد.`
    : iso && max && iso > max ? `تاریخ باید تا ${formatPersianDate(max)} باشد.` : "";

  useEffect(() => {
    inputRef.current?.setCustomValidity(error);
  }, [error]);

  function select(date: Date | undefined) {
    const next = date ? dateToISO(date) : "";
    setDraft({ source: next, text: formatPersianDate(next) });
    onValueChange(next);
    setOpen(false);
  }

  return (
    <div className="w-full min-w-0">
      <Popover open={open && !disabled && !readOnly} onOpenChange={setOpen} modal>
        <PopoverAnchor asChild>
          <div className="relative" dir="ltr">
            <Input {...props} ref={inputRef} id={inputId} type="text" dir="ltr"
              value={text} size={size} disabled={disabled} readOnly={readOnly}
              required={required} placeholder={props.placeholder ?? "۱۴۰۵/۰۱/۰۱"}
              aria-label={ariaLabel} aria-invalid={error ? "true" : props["aria-invalid"]}
              aria-describedby={[props["aria-describedby"], error ? errorId : ""].filter(Boolean).join(" ") || undefined}
              className={`pe-12 tabular-nums ${className ?? ""}`} autoComplete="off"
              onChange={(event) => {
                const nextText = event.target.value;
                const nextDate = parsePersianDate(nextText);
                const next = nextDate ? dateToISO(nextDate) : "";
                setDraft({ source: next, text: nextText });
                onValueChange(next);
              }}
              onBlur={(event) => {
                if (parsed && !error) setDraft({ source: value, text: formatPersianDate(value) });
                onBlur?.(event);
              }}
              onKeyDown={(event) => {
                onKeyDown?.(event);
                if (event.key === "ArrowDown" && !event.defaultPrevented) {
                  event.preventDefault(); setOpen(true);
                }
              }}
            />
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size={size === "sm" ? "icon-sm" : "icon"}
                disabled={disabled || readOnly} className="absolute end-0 top-0"
                aria-label={ariaLabel ? `انتخاب ${ariaLabel}` : "باز کردن تقویم شمسی"}>
                <CalendarBlank aria-hidden="true" />
              </Button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-3" dir="rtl">
          <DayPicker key={open ? value : "closed"} className="persian-calendar"
            mode="single" selected={selected} onSelect={select}
            defaultMonth={selected} autoFocus captionLayout="dropdown" navLayout="after"
            startMonth={min ? dateFromISO(min) : calendar.newDate(1300, 0, 1)}
            endMonth={max ? dateFromISO(max) : calendar.newDate(1500, 11, 29)}
            disabled={[
              ...(min && dateFromISO(min) ? [{ before: dateFromISO(min)! }] : []),
              ...(max && dateFromISO(max) ? [{ after: dateFromISO(max)! }] : []),
            ]}
          />
          <div className="mt-3 flex justify-between gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" size="sm"
              disabled={Boolean((min && dateToISO(new Date()) < min) || (max && dateToISO(new Date()) > max))}
              onClick={() => select(new Date())}>امروز</Button>
            {!required && <Button type="button" variant="ghost" size="sm" onClick={() => select(undefined)}>پاک کردن</Button>}
          </div>
        </PopoverContent>
      </Popover>
      {name && <Input type="hidden" name={name} value={value} disabled={disabled} />}
      {error && <p id={errorId} role="alert" className="mt-1 text-xs text-ds-danger">{error}</p>}
    </div>
  );
}
