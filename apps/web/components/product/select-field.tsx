"use client";

import type { ComponentProps, ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY_VALUE = "__didban_empty_select_value__";

type SelectFieldProps = Omit<
  ComponentProps<typeof Select>,
  "children" | "onValueChange"
> & {
  children: ReactNode;
  className?: string;
  size?: ComponentProps<typeof SelectTrigger>["size"];
  isInvalid?: boolean;
  id?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  "aria-label"?: ComponentProps<typeof SelectTrigger>["aria-label"];
  "aria-labelledby"?: ComponentProps<typeof SelectTrigger>["aria-labelledby"];
  "aria-describedby"?: ComponentProps<typeof SelectTrigger>["aria-describedby"];
  "aria-invalid"?: ComponentProps<typeof SelectTrigger>["aria-invalid"];
};

/** A form-friendly product field composed from the shadcn/Radix Select primitives. */
export function SelectField({
  children,
  className,
  size,
  isInvalid,
  id,
  onChange,
  onValueChange,
  placeholder = "انتخاب کنید",
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: SelectFieldProps) {
  const value = props.value === "" ? EMPTY_VALUE : props.value;
  const defaultValue =
    props.defaultValue === "" ? EMPTY_VALUE : props.defaultValue;

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
      <SelectTrigger
        id={id}
        size={size}
        isInvalid={isInvalid}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid ?? (isInvalid ? true : undefined)}
        className={className}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

export function SelectOption({
  value,
  ...props
}: ComponentProps<typeof SelectItem>) {
  return <SelectItem value={value === "" ? EMPTY_VALUE : value} {...props} />;
}
