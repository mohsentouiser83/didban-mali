import { toPersianDigits } from "./date-utils";

export type ValidatableControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** UI constraints only; application/domain validation remains in controllers and services. */
export function fieldValidationMessage(control: ValidatableControl): string {
  if (!control.willValidate) return "";
  const { validity, value } = control;
  if (validity.customError) return control.validationMessage;
  if (validity.valueMissing || (control.required && !value.trim())) return "این فیلد را تکمیل کنید.";
  if (validity.typeMismatch) return control.type === "email" ? "ایمیل معتبر وارد کنید." : "نشانی معتبر وارد کنید.";
  if ("minLength" in control && value && control.minLength > 0 && value.length < control.minLength) return `حداقل ${toPersianDigits(control.minLength)} نویسه وارد کنید.`;
  if ("maxLength" in control && control.maxLength > 0 && value.length > control.maxLength) return `حداکثر ${toPersianDigits(control.maxLength)} نویسه وارد کنید.`;
  if (validity.patternMismatch || validity.badInput) return "مقدار معتبر وارد کنید.";
  if (validity.rangeUnderflow && "min" in control) return `مقدار باید حداقل ${toPersianDigits(control.min)} باشد.`;
  if (validity.rangeOverflow && "max" in control) return `مقدار باید حداکثر ${toPersianDigits(control.max)} باشد.`;
  if (validity.stepMismatch) return "مقدار با گام مجاز سازگار نیست.";
  return validity.valid ? "" : "مقدار معتبر وارد کنید.";
}

export function isValidatableControl(element: Element): element is ValidatableControl {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement;
}
