"use client";
import {
  useState,
  type FormEvent,
  type ComponentProps,
  type ReactNode,
} from "react";
import { AppIcon, type AppIconName } from "./app-icon";
import { cx } from "./button";
function useValidation(id?: string, describedBy?: string) {
  const [invalid, setInvalid] = useState<string>();
  return {
    invalid,
    props: {
      "aria-invalid": invalid ? true : undefined,
      "aria-describedby":
        [describedBy, invalid ? `${id}-required-error` : undefined]
          .filter(Boolean)
          .join(" ") || undefined,
      onInvalid: (e: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        e.preventDefault();
        const v = e.currentTarget.validity;
        setInvalid(
          v.customError
            ? e.currentTarget.validationMessage
            : v.valueMissing
              ? "این فیلد را تکمیل کنید."
              : v.typeMismatch
                ? "ایمیل معتبر وارد کنید."
                : v.tooShort
                  ? `حداقل ${e.currentTarget.minLength} نویسه وارد کنید.`
                  : "مقدار واردشده معتبر نیست.",
        );
      },
      onInput: () => setInvalid(undefined),
    },
  };
}
export function Input({
  className,
  onInvalid,
  onInput,
  ...props
}: ComponentProps<"input">) {
  const v = useValidation(props.id, props["aria-describedby"]);
  return (
    <>
      <input
        className={cx(
          "min-h-12 w-full min-w-0 rounded-control border border-border bg-surface px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted/70 focus:border-primary focus:ring-3 focus:ring-primary/10 disabled:bg-background disabled:text-muted aria-invalid:border-danger aria-invalid:ring-danger/10 motion-reduce:transition-none",
          className,
        )}
        {...props}
        {...v.props}
        onInvalid={(e) => {
          v.props.onInvalid(e);
          onInvalid?.(e);
        }}
        onInput={(e) => {
          v.props.onInput();
          onInput?.(e);
        }}
      />
      <FieldError id={`${props.id}-required-error`}>{v.invalid}</FieldError>
    </>
  );
}
export function Textarea({
  className,
  onInvalid,
  onInput,
  ...props
}: ComponentProps<"textarea">) {
  const v = useValidation(props.id, props["aria-describedby"]);
  return (
    <>
      <textarea
        className={cx(
          "min-h-24 w-full rounded-control border border-border px-3 py-2 outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 aria-invalid:border-danger",
          className,
        )}
        {...props}
        {...v.props}
        onInvalid={(e) => {
          v.props.onInvalid(e);
          onInvalid?.(e);
        }}
        onInput={(e) => {
          v.props.onInput();
          onInput?.(e);
        }}
      />
      <FieldError id={`${props.id}-required-error`}>{v.invalid}</FieldError>
    </>
  );
}
export function FieldError({
  id,
  children,
}: {
  id?: string;
  children?: ReactNode;
}) {
  return children ? (
    <p id={id} className="text-sm text-danger" role="alert">
      {children}
    </p>
  ) : null;
}
export function FieldDescription({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <p id={id} className="text-xs text-muted">
      {children}
    </p>
  );
}
export function Field({
  id,
  label,
  error,
  icon = "Pencil",
  children,
}: {
  id: string;
  label: string;
  icon?: AppIconName;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="flex min-h-6 items-center gap-2 font-medium"
      >
        <AppIcon name={icon} size={16} className="text-primary" />
        {label}
      </label>
      {children}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}
export function FormMessage({
  children,
  success = false,
}: {
  children?: ReactNode;
  success?: boolean;
}) {
  return children ? (
    <div
      role={success ? "status" : "alert"}
      className={cx(
        "rounded-control border p-3 text-sm",
        success
          ? "border-success/20 bg-success/5 text-success"
          : "border-danger/20 bg-danger/5 text-danger",
      )}
    >
      {children}
    </div>
  ) : null;
}
