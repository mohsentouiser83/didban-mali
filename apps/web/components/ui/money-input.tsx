"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useFormValidation } from "./form";
import { Input } from "./field";
import { groupMoneyDigits, normalizeMoneyInput } from "@/lib/money";

type Props = Omit<
  ComponentProps<typeof Input>,
  "value" | "defaultValue" | "onChange" | "type"
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
};

/** Visible grouped text and an exact, ungrouped form value. */
export function MoneyInput({
  value,
  defaultValue = "",
  onValueChange,
  name,
  pattern = "[0-9]+([.][0-9]{1,6})?",
  disabled,
  onInput,
  onKeyDown,
  ...props
}: Props) {
  const [local, setLocal] = useState(defaultValue);
  const raw = value ?? local;
  const selection = useRef<{ start: number; end: number } | null>(null);
  const shown = groupMoneyDigits(raw);
  const valid = raw === "" || new RegExp(`^(?:${pattern})$`).test(raw);
  const register = useFormValidation();
  useEffect(() => {
    if (props.id && register) {
      return register(props.id, () => (valid ? null : "مبلغ معتبر وارد کنید."));
    }
  }, [props.id, register, valid]);
  return (
    <>
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        dir="ltr"
        disabled={disabled}
        value={shown}
        ref={(input) => {
          if (!input) return;
          input.setCustomValidity(valid ? "" : "مبلغ معتبر وارد کنید.");
          if (selection.current && document.activeElement === input) {
            input.setSelectionRange(
              selection.current.start,
              selection.current.end,
            );
            selection.current = null;
          }
        }}
        onInput={onInput}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          const input = event.currentTarget;
          const start = input.selectionStart ?? 0;
          if (start !== input.selectionEnd) return;
          if (event.key === "Backspace" && input.value[start - 1] === ",") {
            input.setSelectionRange(Math.max(0, start - 2), start);
          } else if (event.key === "Delete" && input.value[start] === ",") {
            input.setSelectionRange(start, start + 2);
          }
        }}
        onChange={(event) => {
          const input = event.currentTarget;
          const next = normalizeMoneyInput(input.value);
          const formatted = groupMoneyDigits(next);
          const position = (end: number) => {
            const count = normalizeMoneyInput(input.value.slice(0, end)).length;
            let seen = 0;
            let index = 0;
            while (index < formatted.length && seen < count) {
              if (formatted[index] !== ",") seen++;
              index++;
            }
            return index;
          };
          selection.current = {
            start: position(input.selectionStart ?? input.value.length),
            end: position(input.selectionEnd ?? input.value.length),
          };
          setLocal(next);
          onValueChange?.(next);
        }}
      />
      {name ? (
        <input type="hidden" name={name} value={raw} disabled={disabled} />
      ) : null}
    </>
  );
}
