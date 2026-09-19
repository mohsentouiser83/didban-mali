"use client";

import type { ComponentProps, ReactNode } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMPTY_VALUE = "__didban_empty_select_value__";

type SelectFieldProps = Omit<ComponentProps<typeof Select>, "children" | "onValueChange"> & {
  children: ReactNode;
  className?: string;
  id?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
};

/** A form-friendly product field composed from the shadcn/Radix Select primitives. */
export function SelectField({ children, className, id, onChange, onValueChange, placeholder = "انتخاب کنید", ...props }: SelectFieldProps) {
  const value = props.value === "" ? EMPTY_VALUE : props.value;
  const defaultValue = props.defaultValue === "" ? EMPTY_VALUE : props.defaultValue;

  return (
    <Select
      {...props}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(value) => {
        const nextValue = value === EMPTY_VALUE ? "" : value;
        onValueChange?.(nextValue);
        onChange?.({ target: { value: nextValue } });
      }}
    >
      <SelectTrigger id={id} className={`w-full ${className ?? ""}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

export function SelectOption({ value, ...props }: ComponentProps<typeof SelectItem>) {
  return <SelectItem value={value === "" ? EMPTY_VALUE : value} {...props} />;
}
