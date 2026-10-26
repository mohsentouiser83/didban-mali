"use client";
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { FieldError } from "./field";
const ValidationContext = createContext<
  ((id: string, validate: () => string | null) => () => void) | null
>(null);
export const useFormValidation = () => useContext(ValidationContext);
export function Form({ children, onSubmit, ...props }: ComponentProps<"form">) {
  const [invalid, setInvalid] = useState(false);
  const checks = useRef(new Map<string, () => string | null>());
  const register = useMemo(
    () => (id: string, validate: () => string | null) => {
      checks.current.set(id, validate);
      return () => {
        checks.current.delete(id);
      };
    },
    [],
  );
  return (
    <ValidationContext.Provider value={register}>
      <form
        {...props}
        noValidate
        onSubmit={(e) => {
          const form = e.currentTarget;
          for (const field of Array.from(
            form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
              "input,textarea",
            ),
          )) {
            if (field.required && !field.value.trim())
              field.setCustomValidity("این فیلد را تکمیل کنید.");
            else field.setCustomValidity("");
          }
          const customInvalid: HTMLElement[] = [];
          checks.current.forEach((validate, id) => {
            const field = form.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
            const error = validate();
            if (
              field instanceof HTMLInputElement ||
              field instanceof HTMLTextAreaElement
            )
              (field as HTMLInputElement).setCustomValidity(error || "");
            else if (field && error) customInvalid.push(field);
          });
          if (!form.checkValidity() || customInvalid.length) {
            e.preventDefault();
            setInvalid(true);
            const fields = [
              ...Array.from(form.querySelectorAll<HTMLElement>(":invalid")),
              ...customInvalid,
            ];
            fields.sort((a, b) =>
              a === b
                ? 0
                : a.compareDocumentPosition(b) &
                    Node.DOCUMENT_POSITION_FOLLOWING
                  ? -1
                  : 1,
            );
            fields[0]?.focus();
            return;
          }
          setInvalid(false);
          onSubmit?.(e);
        }}
        onInput={(e) => {
          setInvalid(false);
          const field = e.target as HTMLInputElement;
          if (field.setCustomValidity) {
            field.setCustomValidity("");
          }
        }}
      >
        {children}
        {invalid ? <ValidationMessages /> : null}
      </form>
    </ValidationContext.Provider>
  );
}
function ValidationMessages() {
  return <FieldError>فیلدهای مشخص‌شده را تکمیل یا اصلاح کنید.</FieldError>;
}
