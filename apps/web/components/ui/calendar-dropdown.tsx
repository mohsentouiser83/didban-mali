"use client";

import type { ChangeEvent } from "react";
import type { DropdownProps } from "react-day-picker";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

/** Adapt DayPicker's value callback to the shared, keyboard-accessible Select. */
export function CalendarDropdown({ options = [], value, onChange, disabled, id, name,
  "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy }: DropdownProps) {
  return (
    <Select dir="rtl" name={name} value={String(value ?? "")} disabled={disabled}
      onValueChange={(next) => {
        // DayPicker's dropdown handlers consume only the selected target value.
        onChange?.({ target: { value: next } } as ChangeEvent<HTMLSelectElement>);
      }}>
      <SelectTrigger id={id} size="sm" aria-label={ariaLabel} aria-labelledby={ariaLabelledBy}
        className="min-w-20 gap-2 px-2 [&>span]:line-clamp-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={String(option.value)} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
