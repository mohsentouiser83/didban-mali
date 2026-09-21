"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList } from "@/components/ui/tabs";

import {
  Building2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

import { ThemeToggle } from "@/components/design-system/theme-toggle";
import { api } from "@/lib/product-api";
import type { User } from "@/lib/product-types";

import { Icon, Mark } from "./icons";

export type AuthMode = "login" | "register";
type FieldName = "full_name" | "workspace_name" | "email" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

export interface AuthScreenProps {
  initialMode?: AuthMode;
}

const initialValues = { full_name: "", workspace_name: "", email: "", password: "" };

export function AuthScreen({ initialMode = "login" }: AuthScreenProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [values, setValues] = useState(initialValues);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const recoveryRef = useRef<HTMLDivElement>(null);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setFieldErrors({});
    setRecoveryOpen(false);
    setCapsLock(false);
    if (typeof window !== "undefined" && (window.location.pathname.startsWith("/login") || window.location.pathname.startsWith("/register"))) {
      window.history.replaceState(null, "", nextMode === "login" ? "/login" : "/register");
    }
  }

  function updateField(name: FieldName, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
    setError("");
  }

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (mode === "register" && values.full_name.trim().length < 2) next.full_name = "نام و نام خانوادگی را کامل وارد کنید.";
    if (mode === "register" && values.workspace_name.trim() && values.workspace_name.trim().length < 2) next.workspace_name = "نام فضای کاری باید حداقل ۲ نویسه باشد.";
    if (!values.email.trim()) next.email = "ایمیل یا نام کاربری را وارد کنید.";
    else if (!(mode === "login" && values.email.trim() === "admin") && !/^\S+@\S+\.\S+$/.test(values.email.trim())) next.email = "یک ایمیل معتبر وارد کنید.";
    if (!values.password) next.password = "رمز عبور را وارد کنید.";
    else if (mode === "register" && values.password.length < 12) next.password = "رمز عبور باید حداقل ۱۲ نویسه باشد.";
    return next;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate();
    const firstInvalid = Object.keys(nextErrors)[0] as FieldName | undefined;
    if (firstInvalid) {
      setFieldErrors(nextErrors);
      requestAnimationFrame(() => document.getElementById(`auth-${firstInvalid}`)?.focus());
      return;
    }
    setBusy(true);
    setError("");
    const payload = mode === "login"
      ? { email: values.email.trim(), password: values.password }
      : { full_name: values.full_name.trim(), workspace_name: values.workspace_name.trim() || undefined, email: values.email.trim(), password: values.password };
    try {
      await api<{ user: User }>(`/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ورود انجام نشد.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="ds-root auth-shell auth-shell-centered relative min-h-screen flex flex-col items-center justify-center p-4 bg-background ds-grid-bg">
      {/* Top Floating Controls */}
      <header className="auth-topbar absolute top-6 end-6 z-20">
        <ThemeToggle />
      </header>

      {/* Centered Panel */}
      <div className="auth-panel w-full max-w-md flex flex-col items-center relative z-10">
        <Card className="auth-card w-full p-6 sm:p-8 rounded-2xl bg-card/90 backdrop-blur-xl border border-border shadow-2xl" data-mode={mode}>
          {/* Brand Header */}
          <div className="auth-brand-header flex flex-col items-center text-center mb-6">
            <div className="brand flex items-center gap-2.5">
              <Mark />
              <span className="brand-title font-extrabold text-xl text-foreground">دیدبان مالی</span>
            </div>
            <span className="kicker text-xs font-semibold text-primary mt-1">سامانه عملیات و کنترل مالی</span>
          </div>

          {/* Mode Switcher */}
          <Tabs value={mode} onValueChange={(value) => changeMode(value as AuthMode)} className="w-full">
            <TabsList className="tabs grid grid-cols-2 h-11 p-1 bg-muted rounded-xl border border-border/70 mb-6 w-full" aria-label="انتخاب نوع ورود">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                onClick={() => changeMode("login")}
                className={`tab-trigger flex items-center justify-center h-full rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  mode === "login"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ورود
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                onClick={() => changeMode("register")}
                className={`tab-trigger flex items-center justify-center h-full rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  mode === "register"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ساخت حساب
              </button>
            </TabsList>

            <div key={mode} className="auth-mode-content animate-[auth-mode-in_200ms_ease-out]">
              <div className="form-title text-center mb-6 space-y-1">
                <span className="text-xs font-semibold text-primary">فضای کاری امن شما</span>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                  {mode === "login" ? "خوش آمدید" : "شروع با دیدبان مالی"}
                </h2>
              </div>

              <form onSubmit={submit} className="auth-form space-y-4" noValidate>
                {mode === "register" && (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="auth-full_name" className="block text-xs font-semibold text-foreground">
                        نام و نام خانوادگی
                      </label>
                      <div className="auth-input-wrap relative flex items-center">
                        <UserIcon className="input-icon absolute right-3.5 size-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="auth-full_name"
                          name="full_name"
                          autoComplete="name"
                          value={values.full_name}
                          onChange={(event) => updateField("full_name", event.target.value)}
                          aria-invalid={Boolean(fieldErrors.full_name)}
                          aria-describedby={fieldErrors.full_name ? "auth-full_name-error" : undefined}
                          placeholder="مثلاً مهسا کریمی"
                          className="pr-10 pl-3 h-11 text-sm bg-background border-border rounded-xl"
                        />
                      </div>
                      {fieldErrors.full_name && (
                        <small id="auth-full_name-error" className="field-error flex items-center gap-1 text-xs text-destructive font-medium mt-1">
                          <Icon name="alert" className="size-3.5" />
                          {fieldErrors.full_name}
                        </small>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                        <label htmlFor="auth-workspace_name">نام فضای کاری</label>
                        <span className="text-[11px] font-normal text-muted-foreground">اختیاری</span>
                      </div>
                      <div className="auth-input-wrap relative flex items-center">
                        <Building2 className="input-icon absolute right-3.5 size-4 text-muted-foreground pointer-events-none" />
                        <Input
                          id="auth-workspace_name"
                          name="workspace_name"
                          value={values.workspace_name}
                          onChange={(event) => updateField("workspace_name", event.target.value)}
                          aria-invalid={Boolean(fieldErrors.workspace_name)}
                          aria-describedby={
                            fieldErrors.workspace_name
                              ? "auth-workspace_name-error"
                              : "auth-workspace_name-hint"
                          }
                          placeholder="مثلاً گروه مالی آریا"
                          className="pr-10 pl-3 h-11 text-sm bg-background border-border rounded-xl"
                        />
                      </div>
                      <small id="auth-workspace_name-hint" className="field-hint block text-[11px] text-muted-foreground">
                        فضای مشترک شرکت، اعضا و گزارش‌ها
                      </small>
                      {fieldErrors.workspace_name && (
                        <small id="auth-workspace_name-error" className="field-error flex items-center gap-1 text-xs text-destructive font-medium mt-1">
                          <Icon name="alert" className="size-3.5" />
                          {fieldErrors.workspace_name}
                        </small>
                      )}
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="auth-email" className="block text-xs font-semibold text-foreground">
                    {mode === "login" ? "ایمیل یا نام کاربری" : "ایمیل کاری"}
                  </label>
                  <div className="auth-input-wrap relative flex items-center">
                    <Mail className="input-icon absolute right-3.5 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="auth-email"
                      name="email"
                      type={mode === "login" ? "text" : "email"}
                      dir={values.email ? "ltr" : "rtl"}
                      autoComplete="email"
                      inputMode={mode === "login" ? "text" : "email"}
                      value={values.email}
                      onChange={(event) => updateField("email", event.target.value)}
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={fieldErrors.email ? "auth-email-error" : undefined}
                      placeholder="ایمیل یا نام کاربری"
                      className="pr-10 pl-3 h-11 text-sm bg-background border-border rounded-xl text-end"
                    />
                  </div>
                  {fieldErrors.email && (
                    <small id="auth-email-error" className="field-error flex items-center gap-1 text-xs text-destructive font-medium mt-1">
                      <Icon name="alert" className="size-3.5" />
                      {fieldErrors.email}
                    </small>
                  )}
                </div>

                <div className="auth-field space-y-1.5">
                  <div className="field-label-row flex items-center justify-between text-xs font-semibold text-foreground">
                    <label htmlFor="auth-password">رمز عبور</label>
                    {mode === "login" && (
                      <button
                        type="button"
                        className="forgot-password text-xs text-primary hover:underline font-normal cursor-pointer"
                        aria-label="رمز را فراموش کرده‌اید؟"
                        onClick={() => {
                          const nextOpen = !recoveryOpen;
                          setRecoveryOpen(nextOpen);
                          if (nextOpen) requestAnimationFrame(() => recoveryRef.current?.focus());
                        }}
                      >
                        رمز را فراموش کرده‌اید؟
                      </button>
                    )}
                  </div>
                  <div className="password-input-wrap relative flex items-center">
                    <Lock className="input-icon absolute right-3.5 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="auth-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      dir={values.password ? "ltr" : "rtl"}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      value={values.password}
                      onChange={(event) => updateField("password", event.target.value)}
                      onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                      onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                      onBlur={() => setCapsLock(false)}
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={
                        [
                          mode === "register" ? "auth-password-hint" : "",
                          capsLock ? "auth-caps-lock" : "",
                          fieldErrors.password ? "auth-password-error" : "",
                        ]
                          .filter(Boolean)
                          .join(" ") || undefined
                      }
                      placeholder="رمز عبور"
                      className="pr-10 pl-10 h-11 text-sm bg-background border-border rounded-xl text-end"
                    />
                    <button
                      type="button"
                      className="password-toggle absolute left-3 size-6 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      aria-label={showPassword ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((shown) => !shown)}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {mode === "register" && (
                    <small id="auth-password-hint" className="field-hint block text-[11px] text-muted-foreground">
                      حداقل ۱۲ نویسه؛ بهتر است از عبارت طولانی و منحصربه‌فرد استفاده کنید.
                    </small>
                  )}
                  {capsLock && (
                    <small id="auth-caps-lock" className="caps-lock-note flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      <Icon name="alert" className="size-3.5" />
                      Caps Lock روشن است.
                    </small>
                  )}
                  {fieldErrors.password && (
                    <small id="auth-password-error" className="field-error flex items-center gap-1 text-xs text-destructive font-medium mt-1">
                      <Icon name="alert" className="size-3.5" />
                      {fieldErrors.password}
                    </small>
                  )}
                </div>

                {mode === "login" && recoveryOpen && (
                  <Alert ref={recoveryRef} className="recovery-note p-3.5 rounded-xl border border-border bg-muted/60 text-xs flex items-start gap-3" id="password-recovery" tabIndex={-1}>
                    <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <AlertTitle className="font-bold text-foreground">راهنمای بازیابی رمز</AlertTitle>
                      <AlertDescription className="text-muted-foreground leading-relaxed">
                        بازیابی ایمیلی در نسخهٔ فعلی فعال نیست. برای بازنشانی امن، با مدیر سامانه یا تیم استقرار سازمان خود تماس بگیرید.
                      </AlertDescription>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRecoveryOpen(false)} aria-label="بستن راهنمای بازیابی" className="h-7 px-2 text-xs">
                      بستن
                    </Button>
                  </Alert>
                )}

                {error && (
                  <Alert ref={errorRef} variant="destructive" className="form-error p-3.5 rounded-xl text-xs" tabIndex={-1}>
                    <AlertTitle className="font-bold">{error}</AlertTitle>
                    <AlertDescription className="text-xs opacity-90 mt-0.5">اطلاعات را دوباره بررسی کنید یا از راهنمای بازیابی استفاده کنید.</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="primary-button w-full h-11 text-sm font-bold rounded-xl shadow-md transition-all active:scale-[0.98]"
                  disabled={busy}
                  aria-busy={busy}
                >
                  {busy ? "کمی صبر کنید…" : mode === "login" ? "ورود به دیدبان" : "ساخت حساب امن"}
                </Button>
              </form>
            </div>
          </Tabs>

          <div className="mobile-trust auth-trust-badge mt-6 flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-primary shrink-0" />
            <span>
              <strong className="font-semibold text-foreground">داده‌های هر شرکت مجزا می‌ماند.</strong> رویدادهای حساس برای پیگیری ثبت می‌شوند.
            </span>
          </div>

          <details className="auth-assurance mt-4 text-xs text-muted-foreground border-t border-border/60 pt-4">
            <summary className="cursor-pointer font-medium hover:text-foreground transition-colors text-center py-1">
              حریم خصوصی، امنیت و پشتیبانی
            </summary>
            <div className="mt-3 space-y-2.5 p-3 rounded-xl bg-muted/40 text-[11px] leading-relaxed">
              <section>
                <strong className="block font-semibold text-foreground mb-0.5">حریم خصوصی و امنیت</strong>
                <p>نشست با کوکی امن نگهداری می‌شود و دادهٔ شرکت‌ها از یکدیگر تفکیک شده است.</p>
              </section>
              <section>
                <strong className="block font-semibold text-foreground mb-0.5">شرایط استفاده</strong>
                <p>این نسخه در مرحلهٔ MVP سازمانی است؛ شرایط نهایی پیش از انتشار عمومی ارائه می‌شود.</p>
              </section>
              <section>
                <strong className="block font-semibold text-foreground mb-0.5">پشتیبانی</strong>
                <p>برای دسترسی یا بازیابی حساب، با مدیر سامانه یا تیم استقرار سازمان خود تماس بگیرید.</p>
              </section>
            </div>
          </details>
        </Card>
      </div>
    </main>
  );
}
