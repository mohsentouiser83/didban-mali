"use client";
import { Field } from "@/components/ui/field";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
export function PayrollDateField(
  props: React.ComponentProps<typeof PersianDatePicker>,
) {
  return (
    <Field id={props.id} label={props.label}>
      <PersianDatePicker {...props} />
    </Field>
  );
}
