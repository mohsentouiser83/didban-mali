"use client";
import { TextAaIcon, type Icon } from "@phosphor-icons/react";
import { cloneElement, isValidElement, useId, type ReactNode } from "react";
import { useFormErrors } from "./form";
export function Field({
  id,
  name,
  label,
  icon: IconComponent = TextAaIcon,
  error,
  description,
  children,
}: {
  id: string;
  name?: string;
  label: string;
  icon?: Icon;
  error?: string;
  description?: string;
  children: ReactNode;
}) {
  const validation = useFormErrors();
  const fieldName = name || id.split("-").at(-1) || id;
  const message = error || validation[id] || validation[fieldName];
  const descriptions = [
    message ? `${id}-error` : null,
    description ? `${id}-description` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const control = isValidElement<{
    name?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }>(children)
    ? cloneElement(children, {
        name: fieldName,
        "aria-invalid": message ? true : undefined,
        "aria-describedby": descriptions || undefined,
      })
    : children;
  return (
    <div className="min-w-0 space-y-2">
      <label
        htmlFor={id}
        className="flex min-h-6 items-center gap-2 font-medium"
      >
        <IconComponent size={18} aria-hidden className="text-primary" />
        {label}
      </label>
      {control}
      {message && <FieldError id={`${id}-error`}>{message}</FieldError>}
      {description && (
        <FieldDescription id={`${id}-description`}>
          {description}
        </FieldDescription>
      )}
    </div>
  );
}
export function FieldError({
  children,
  id,
}: {
  children?: ReactNode;
  id?: string;
}) {
  return children ? (
    <p id={id} role="alert" className="text-sm text-danger motion-safe:animate-fade-in">
      {children}
    </p>
  ) : null;
}
export function FieldDescription({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <p id={id} className="text-xs leading-6 text-muted">
      {children}
    </p>
  );
}
export function FormMessage({
  children,
  error = false,
}: {
  children?: ReactNode;
  error?: boolean;
}) {
  const id = useId();
  return children ? (
    <p
      id={id}
      role={error ? "alert" : "status"}
      className={
        error
          ? "rounded-control bg-danger-soft p-3 text-danger motion-safe:animate-fade-in"
          : "rounded-control bg-primary-soft p-3 text-primary motion-safe:animate-fade-in"
      }
    >
      {children}
    </p>
  ) : null;
}
