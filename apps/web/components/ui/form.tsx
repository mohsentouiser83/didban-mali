"use client";

import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { fieldValidationMessage, isValidatableControl } from "@/lib/form-validation";
import { FieldError } from "./field";
import { Alert } from "./alert";
import { cn } from "@/lib/utils";

const FormContext = createContext<{ errors: Record<string, string>; clearResolved: (id: string) => void } | null>(null);

/** Replaces browser validation bubbles with the project's Persian inline messages. */
export function Form({ noValidate, onSubmit, onInputCapture, onChangeCapture, onReset, className, ...props }: ComponentPropsWithoutRef<"form">) {
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearResolved = useCallback((id: string) => {
    const control = Array.from(formRef.current?.elements ?? []).find((element) => element.id === id);
    if (!control || !isValidatableControl(control)) return;
    const message = fieldValidationMessage(control);
    setErrors((current) => {
      if (!current[id] || current[id] === message) return current;
      const next = { ...current };
      if (message) next[id] = message; else delete next[id];
      return next;
    });
  }, []);
  const context = useMemo(() => ({ errors, clearResolved }), [errors, clearResolved]);
  return <FormContext.Provider value={context}><form {...props} className={cn("min-w-0 max-sm:[&_[data-slot=button]]:min-h-11 max-sm:[&_[data-slot=button]]:min-w-11", className)} ref={formRef} data-slot="form" noValidate
    onInputCapture={(event) => { if (event.target instanceof Element) clearResolved(event.target.id); onInputCapture?.(event); }}
    onChangeCapture={(event) => { if (event.target instanceof Element) clearResolved(event.target.id); onChangeCapture?.(event); }}
    onInvalidCapture={(event) => event.preventDefault()}
    onReset={(event) => { setErrors({}); onReset?.(event); }}
    onSubmit={(event) => {
      if (!noValidate) {
        const invalid = Array.from(event.currentTarget.elements).filter(isValidatableControl).map((control) => ({ control, message: fieldValidationMessage(control) })).filter(({ message }) => message);
        setErrors(Object.fromEntries(invalid.map(({ control, message }) => [control.id || control.name, message])));
        if (invalid.length) { event.preventDefault(); invalid[0].control.focus(); return; }
      }
      onSubmit?.(event);
    }}
  /></FormContext.Provider>;
}

/** Used by shared controls so message IDs and invalid state cannot drift apart. */
export function useFormFieldFeedback(id: string | undefined, value: unknown, externallyInvalid?: boolean) {
  const generatedId = useId();
  const resolvedId = id ?? generatedId;
  const context = useContext(FormContext);
  const error = context?.errors[resolvedId];
  const clearResolved = context?.clearResolved;
  useEffect(() => { if (error) clearResolved?.(resolvedId); }, [resolvedId, value, error, clearResolved]);
  return { id: context ? resolvedId : id, error: externallyInvalid ? undefined : error, messageId: `${resolvedId}-validation` };
}

export function FormFieldFeedback({ id, message }: { id: string; message?: string }) {
  return message ? <FieldError id={id} dir="rtl" className="mt-1 w-full min-w-0 items-start leading-relaxed [overflow-wrap:anywhere]">{message}</FieldError> : null;
}

export const FormMessage = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof Alert>>(({ variant = "destructive", className, ...props }, ref) => (
  <Alert ref={ref} variant={variant} role={variant === "destructive" || variant === "danger" ? "alert" : "status"} data-slot="form-message" dir="rtl" className={cn("min-w-0 p-3 text-sm leading-relaxed [overflow-wrap:anywhere] motion-reduce:transition-none", className)} {...props} />
));
FormMessage.displayName = "FormMessage";
