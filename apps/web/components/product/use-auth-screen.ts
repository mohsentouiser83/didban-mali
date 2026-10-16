"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/product-api";
import type { User } from "@/lib/product-types";
export type AuthMode = "login" | "register";
type FieldName = "full_name" | "workspace_name" | "email" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

const initialValues = {
  full_name: "",
  workspace_name: "",
  email: "",
  password: "",
};

export function useAuthScreen(initialMode: AuthMode) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [values, setValues] = useState(initialValues);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const recoveryRef = useRef<HTMLDivElement>(null);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setFieldErrors({});
    setRecoveryOpen(false);
    setCapsLock(false);
    if (
      typeof window !== "undefined" &&
      (window.location.pathname.startsWith("/login") ||
        window.location.pathname.startsWith("/register"))
    ) {
      window.history.replaceState(
        null,
        "",
        nextMode === "login" ? "/login" : "/register",
      );
    }
  }

  function updateField(name: FieldName, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
    setError("");
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (mode === "register" && values.full_name.trim().length < 2)
      next.full_name = "نام و نام خانوادگی را کامل وارد کنید.";
    if (
      mode === "register" &&
      values.workspace_name.trim() &&
      values.workspace_name.trim().length < 2
    )
      next.workspace_name = "نام فضای کاری باید حداقل ۲ نویسه باشد.";
    if (!values.email.trim()) next.email = "ایمیل یا نام کاربری را وارد کنید.";
    else if (
      !(mode === "login" && values.email.trim() === "admin") &&
      !/^\S+@\S+\.\S+$/.test(values.email.trim())
    )
      next.email = "یک ایمیل معتبر وارد کنید.";
    if (!values.password) next.password = "رمز عبور را وارد کنید.";
    else if (mode === "register" && values.password.length < 12)
      next.password = "رمز عبور باید حداقل ۱۲ نویسه باشد.";
    return next;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    const firstInvalid = Object.keys(nextErrors)[0] as FieldName | undefined;
    if (firstInvalid) {
      setFieldErrors(nextErrors);
      requestAnimationFrame(() =>
        document.getElementById(`auth-${firstInvalid}`)?.focus(),
      );
      return;
    }
    setBusy(true);
    setError("");
    const payload =
      mode === "login"
        ? { email: values.email.trim(), password: values.password }
        : {
            full_name: values.full_name.trim(),
            workspace_name: values.workspace_name.trim() || undefined,
            email: values.email.trim(),
            password: values.password,
          };
    try {
      await api<{ user: User }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ورود انجام نشد.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  return { mode, busy, error, fieldErrors, values, showPassword, setShowPassword, capsLock, setCapsLock, recoveryOpen, setRecoveryOpen, errorRef, recoveryRef, changeMode, updateField, submit };
}
