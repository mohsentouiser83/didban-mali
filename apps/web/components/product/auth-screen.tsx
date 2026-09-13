"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";

import { ThemeToggle } from "@/components/design-system/theme-toggle";
import { api } from "@/lib/product-api";
import type { User } from "@/lib/product-types";

import { Icon, Mark } from "./icons";

type AuthMode = "login" | "register";
type FieldName = "full_name" | "workspace_name" | "email" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

const initialValues = { full_name: "", workspace_name: "", email: "", password: "" };

export function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
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

  return <main className="ds-root auth-shell">
    <section className="auth-story" aria-labelledby="welcome-title">
      <div className="brand brand-light"><Mark /><span>دیدبان مالی</span></div>
      <div><span className="kicker">سامانه عملیات و کنترل مالی</span><h1 id="welcome-title">تصمیم مالی،<br/><em>با سند و اطمینان.</em></h1><p>یک لایهٔ مستقل روی سیستم حسابداری شما؛ برای کنترل کیفیت داده، تحلیل و پیگیری یافته‌ها.</p></div>
      <div className="auth-proof" aria-label="نمونه رد عملیاتی دیدبان مالی"><span className="auth-proof-title"><Icon name="evidence" />رد عملیاتی، از ورودی تا تصمیم</span><ol><li><Icon name="upload" /><span><strong>ورودی داده ثبت شد</strong><small>منبع و زمان ورود محفوظ است</small></span></li><li><Icon name="reconcile" /><span><strong>تطبیق قابل ردیابی</strong><small>هر نتیجه به سند اصلی متصل است</small></span></li><li><Icon name="users" /><span><strong>تصمیم نهایی با انسان</strong><small>یافته بدون بررسی تأیید نمی‌شود</small></span></li></ol></div>
    </section>
    <section className="auth-panel">
      <div className="auth-theme"><ThemeToggle /></div>
      <div className="auth-card" data-mode={mode}>
        <div className="mobile-brand"><Mark />دیدبان مالی</div>
        <div className="tabs" aria-label="انتخاب نوع ورود"><Button type="button" aria-pressed={mode === "login"} onClick={() => changeMode("login")}>ورود</Button><Button type="button" aria-pressed={mode === "register"} onClick={() => changeMode("register")}>ساخت حساب</Button></div>
        <div key={mode} className="auth-mode-content">
          <div className="form-title"><span>فضای کاری امن شما</span><h2>{mode === "login" ? "خوش آمدید" : "شروع با دیدبان مالی"}</h2><p>{mode === "login" ? "برای ادامه وارد حساب خود شوید." : "حساب مدیر و فضای کاری اولیه را بسازید؛ نام فضای کاری بعداً قابل تغییر است."}</p></div>
          <form onSubmit={submit} className="auth-form" noValidate>
            {mode === "register" && <><label htmlFor="auth-full_name">نام و نام خانوادگی<Input id="auth-full_name" name="full_name" autoComplete="name" value={values.full_name} onChange={(event) => updateField("full_name", event.target.value)} aria-invalid={Boolean(fieldErrors.full_name)} aria-describedby={fieldErrors.full_name ? "auth-full_name-error" : undefined} placeholder="مثلاً مهسا کریمی" />{fieldErrors.full_name && <small id="auth-full_name-error" className="field-error"><Icon name="alert" />{fieldErrors.full_name}</small>}</label><label htmlFor="auth-workspace_name"><span className="field-label-row">نام فضای کاری <small>اختیاری</small></span><Input id="auth-workspace_name" name="workspace_name" value={values.workspace_name} onChange={(event) => updateField("workspace_name", event.target.value)} aria-invalid={Boolean(fieldErrors.workspace_name)} aria-describedby={fieldErrors.workspace_name ? "auth-workspace_name-error" : "auth-workspace_name-hint"} placeholder="مثلاً گروه مالی آریا" /><small id="auth-workspace_name-hint" className="field-hint">فضای مشترک شرکت، اعضا و گزارش‌ها</small>{fieldErrors.workspace_name && <small id="auth-workspace_name-error" className="field-error"><Icon name="alert" />{fieldErrors.workspace_name}</small>}</label></>}
            <label htmlFor="auth-email">{mode === "login" ? "ایمیل یا نام کاربری" : "ایمیل کاری"}<Input id="auth-email" name="email" type={mode === "login" ? "text" : "email"} dir="ltr" autoComplete="email" inputMode={mode === "login" ? "text" : "email"} value={values.email} onChange={(event) => updateField("email", event.target.value)} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "auth-email-error" : undefined} placeholder={mode === "login" ? "admin یا name@company.ir" : "name@company.ir"} />{fieldErrors.email && <small id="auth-email-error" className="field-error"><Icon name="alert" />{fieldErrors.email}</small>}</label>
            <div className="auth-field"><div className="field-label-row"><label htmlFor="auth-password">رمز عبور</label>{mode === "login" && <Button type="button" className="forgot-password" aria-label="رمز را فراموش کرده‌اید؟" onClick={() => { const nextOpen = !recoveryOpen; setRecoveryOpen(nextOpen); if (nextOpen) requestAnimationFrame(() => recoveryRef.current?.focus()); }}>رمز را فراموش کرده‌اید؟</Button>}</div><span className="password-input-wrap"><Input id="auth-password" name="password" type={showPassword ? "text" : "password"} dir="ltr" autoComplete={mode === "login" ? "current-password" : "new-password"} value={values.password} onChange={(event) => updateField("password", event.target.value)} onKeyDown={(event) => setCapsLock(event.getModifierState("CapsLock"))} onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))} onBlur={() => setCapsLock(false)} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={[mode === "register" ? "auth-password-hint" : "", capsLock ? "auth-caps-lock" : "", fieldErrors.password ? "auth-password-error" : ""].filter(Boolean).join(" ") || undefined} placeholder="رمز عبور" /><Button type="button" className="password-toggle" aria-label={showPassword ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"} aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? <EyeOff /> : <Eye />}</Button></span>{mode === "register" && <small id="auth-password-hint" className="field-hint">حداقل ۱۲ نویسه؛ بهتر است از عبارت طولانی و منحصربه‌فرد استفاده کنید.</small>}{capsLock && <small id="auth-caps-lock" className="caps-lock-note"><Icon name="alert" />Caps Lock روشن است.</small>}{fieldErrors.password && <small id="auth-password-error" className="field-error"><Icon name="alert" />{fieldErrors.password}</small>}</div>
            {mode === "login" && recoveryOpen && <div ref={recoveryRef} className="recovery-note" id="password-recovery" tabIndex={-1}><Icon name="shield" /><div><strong>راهنمای بازیابی رمز</strong><p>بازیابی ایمیلی در نسخهٔ فعلی فعال نیست. برای بازنشانی امن، با مدیر سامانه یا تیم استقرار سازمان خود تماس بگیرید.</p></div><Button type="button" onClick={() => setRecoveryOpen(false)} aria-label="بستن راهنمای بازیابی">بستن</Button></div>}
            {error && <p ref={errorRef} className="form-error" role="alert" tabIndex={-1}>{error}<span>اطلاعات را دوباره بررسی کنید یا از راهنمای بازیابی استفاده کنید.</span></p>}
            <Button className="primary-button" disabled={busy} aria-busy={busy}>{busy ? "کمی صبر کنید…" : mode === "login" ? "ورود به دیدبان" : "ساخت حساب امن"}</Button>
          </form>
        </div>
        <div className="mobile-trust"><Icon name="shield" /><span><strong>داده‌های هر شرکت مجزا می‌ماند.</strong> رویدادهای حساس برای پیگیری ثبت می‌شوند.</span></div>
        <details className="auth-assurance"><summary>حریم خصوصی، امنیت و پشتیبانی</summary><div><section><strong>حریم خصوصی و امنیت</strong><p>نشست با کوکی امن نگهداری می‌شود و دادهٔ شرکت‌ها از یکدیگر تفکیک شده است.</p></section><section><strong>شرایط استفاده</strong><p>این نسخه در مرحلهٔ MVP سازمانی است؛ شرایط نهایی پیش از انتشار عمومی ارائه می‌شود.</p></section><section><strong>پشتیبانی</strong><p>برای دسترسی یا بازیابی حساب، با مدیر سامانه یا تیم استقرار سازمان خود تماس بگیرید.</p></section></div></details>
      </div>
    </section>
  </main>;
}
