"use client";
import { cn } from "@/lib/utils";
import {
  createContext,
  useContext,
  useState,
  type FormHTMLAttributes,
} from "react";
const ValidationContext = createContext<Record<string, string>>({});
export function useFormErrors() {
  return useContext(ValidationContext);
}
export function Form({
  onSubmit,
  children,
  className,
  fieldErrors,
  ref,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & {
  ref?: React.Ref<HTMLFormElement>;
  fieldErrors?: Record<string, string>;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [corrections, setCorrections] = useState<{
    source?: Record<string, string>;
    keys: string[];
  }>({ keys: [] });
  const hidden = corrections.source === fieldErrors ? corrections.keys : [];
  const visibleExternal = Object.fromEntries(
    Object.entries(fieldErrors || {}).filter(([key]) => !hidden.includes(key)),
  );
  return (
    <ValidationContext.Provider value={{ ...visibleExternal, ...errors }}>
      <form
        ref={ref}
        {...props}
        noValidate
        className={cn("space-y-5", className)}
        onSubmit={(event) => {
          const fields = Array.from(event.currentTarget.elements).filter(
            (node): node is HTMLInputElement | HTMLTextAreaElement =>
              node instanceof HTMLInputElement ||
              node instanceof HTMLTextAreaElement,
          );
          const next: Record<string, string> = {};
          for (const field of fields) {
            if (field.required && !field.value.trim())
              next[field.id] = "این مورد را وارد کنید.";
            else if (!field.validity.valid)
              next[field.id] =
                field.type === "email"
                  ? "ایمیل معتبر وارد کنید."
                  : field.validity.tooShort
                    ? `حداقل ${field.minLength} نویسه وارد کنید.`
                    : "مقدار معتبر وارد کنید.";
            field.setAttribute("aria-invalid", String(Boolean(next[field.id])));
            if (next[field.id]) {
              const descriptions = new Set(
                (field.getAttribute("aria-describedby") || "")
                  .split(" ")
                  .filter(Boolean),
              );
              descriptions.add(`${field.id}-error`);
              field.setAttribute(
                "aria-describedby",
                [...descriptions].join(" "),
              );
            }
          }
          setErrors(next);
          if (Object.keys(next).length) {
            event.preventDefault();
            fields.find((field) => next[field.id])?.focus();
            return;
          }
          onSubmit?.(event);
        }}
        onInput={(event) => {
          const target = event.target as HTMLInputElement;
          if (fieldErrors?.[target.name])
            setCorrections((previous) => ({
              source: fieldErrors,
              keys: [
                ...(previous.source === fieldErrors ? previous.keys : []),
                target.name,
              ],
            }));
          if (errors[target.id]) {
            target.removeAttribute("aria-invalid");
            const descriptions = (target.getAttribute("aria-describedby") || "")
              .split(" ")
              .filter((id) => id !== `${target.id}-error`);
            if (descriptions.length)
              target.setAttribute("aria-describedby", descriptions.join(" "));
            else target.removeAttribute("aria-describedby");
            setErrors((previous) => {
              const next = { ...previous };
              delete next[target.id];
              return next;
            });
          }
        }}
      >
        {children}
      </form>
    </ValidationContext.Provider>
  );
}
