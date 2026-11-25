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
  required,
  children,
}: {
  id: string;
  name?: string;
  label: string;
  icon?: Icon;
  error?: string;
  description?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const child = isValidElement<{
    id?: string;
    name?: string;
    required?: boolean;
    "aria-required"?: boolean | "true" | "false";
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
  }>(children)
    ? children
    : null;
  const isRequired =
    required ??
    Boolean(
      child?.props.required ||
        child?.props["aria-required"] === true ||
        child?.props["aria-required"] === "true",
    );
  const validation = useFormErrors();
  const fieldName = name || id.split("-").at(-1) || id;
  const message = error || validation[id] || validation[fieldName];
  const descriptions = [
    message ? `${id}-error` : null,
    description ? `${id}-description` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const control = child
    ? cloneElement(child, {
        id: child.props.id || id,
        name: fieldName,
        "aria-required": isRequired || undefined,
        "aria-invalid": message ? true : undefined,
        "aria-describedby": descriptions || undefined,
      })
    : children;
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-h-6 items-center gap-2 font-medium">
        <label htmlFor={id} className="flex items-center gap-2">
          <IconComponent size={18} aria-hidden className="text-primary" />
          {label}
        </label>
        {isRequired && <RequiredIndicator />}
      </div>
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
export function RequiredIndicator() {
  return <span aria-hidden="true" className="shrink-0 text-danger">*</span>;
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
