"use client";
import { useState, useEffect, useRef } from "react";
import { DayPicker } from "@daypicker/persian";
import type { DayButtonProps } from "@daypicker/react";
import { CalendarDays } from "lucide-react";
import { Button, cx } from "./button";
import { Input } from "./field";
import { Popover } from "./popover";
import { useFormValidation } from "./form";
import { formatDate, parseJalali, isoDate } from "@/lib/dates";
function CalendarDay({ day, modifiers, className, ...props }: DayButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  return (
    <Button
      {...props}
      ref={ref}
      variant="ghost"
      className={cx(
        "size-11 min-h-11 rounded-control p-0 tabular-nums",
        modifiers.selected &&
          "bg-primary text-white hover:bg-primary-hover hover:text-white",
        modifiers.today && !modifiers.selected && "bg-accent text-primary",
        className,
      )}
      data-date={isoDate(day.date)}
    />
  );
}
function CalendarNav(props: React.ComponentProps<"button">) {
  return (
    <Button
      {...props}
      variant="ghost"
      className="pointer-events-auto size-11 px-0"
    />
  );
}
export function PersianDatePicker({
  id,
  name,
  label,
  initialValue = "",
  required = false,
  disabled = false,
}: {
  id: string;
  name: string;
  label: string;
  initialValue?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(
      initialValue ? formatDate(initialValue) : "",
    ),
    [open, setOpen] = useState(false);
  const iso = parseJalali(text),
    register = useFormValidation();
  useEffect(
    () =>
      register?.(id, () =>
        !text.trim()
          ? required
            ? "تاریخ را انتخاب کنید."
            : null
          : iso
            ? null
            : "تاریخ شمسی معتبر وارد کنید.",
      ),
    [register, id, required, text, iso],
  );
  return (
    <div className="relative">
      <Input
        id={id}
        name={`${name}_display`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        dir="ltr"
        inputMode="numeric"
        placeholder="۱۴۰۵/۰۱/۰۱"
        autoComplete="off"
        required={required}
        disabled={disabled}
        className="ps-14 pe-4 tabular-nums"
      />
      <Input type="hidden" name={name} value={iso ?? ""} />
      <div className="absolute end-0 top-0">
        <Popover
          open={open}
          onOpenChange={setOpen}
          trigger={
            <Button
              variant="ghost"
              aria-label={`تقویم ${label}`}
              disabled={disabled}
              className="min-h-12 px-3"
            >
              <CalendarDays size={18} />
            </Button>
          }
        >
          <DayPicker
            mode="single"
            selected={iso ? new Date(iso + "T12:00:00") : undefined}
            defaultMonth={iso ? new Date(iso + "T12:00:00") : undefined}
            onSelect={(date) => {
              if (date) {
                setText(formatDate(isoDate(date)));
                setOpen(false);
              }
            }}
            autoFocus
            components={{
              DayButton: CalendarDay,
              NextMonthButton: CalendarNav,
              PreviousMonthButton: CalendarNav,
            }}
            classNames={{
              root: "relative w-[308px] font-sans text-sm",
              months: "flex",
              month: "w-full",
              month_caption: "flex h-11 items-center justify-center",
              caption_label: "font-medium",
              nav: "pointer-events-none absolute inset-x-0 top-0 flex justify-between",
              month_grid: "w-full border-collapse",
              weekdays: "",
              weekday: "h-9 text-xs font-normal text-muted",
              day: "p-0 text-center",
              day_button: "size-11",
              outside: "text-muted/50",
              disabled: "opacity-40",
              selected: "",
              today: "",
              hidden: "invisible",
              week: "",
            }}
          />
        </Popover>
      </div>
    </div>
  );
}
