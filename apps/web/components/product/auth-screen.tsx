"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { ThemeToggle } from "@/components/design-system/theme-toggle";
import { api } from "@/lib/product-api";
import type { User } from "@/lib/product-types";

import { Icon, Mark } from "./icons";

export function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await api<{ user: User }>(`/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ورود انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="ds-root auth-shell">
    <section className="auth-story" aria-labelledby="welcome-title">
      <div className="brand brand-light"><Mark /><span>دیدبان مالی</span></div>
      <div><span className="kicker">سامانه عملیات و کنترل مالی</span><h1 id="welcome-title">تصمیم مالی،<br/><em>با سند و اطمینان.</em></h1><p>یک لایهٔ مستقل روی سیستم حسابداری شما؛ برای کنترل کیفیت داده، تحلیل و پیگیری یافته‌ها.</p></div>
      <div className="trust-row"><span>دادهٔ هر شرکت کاملاً مجزا</span><span>ثبت رویدادهای حساس</span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-theme"><ThemeToggle /></div>
      <div className="auth-card">
        <div className="mobile-brand"><Mark />دیدبان مالی</div>
        <div className="tabs" role="tablist" aria-label="نوع ورود"><button role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setError(""); }}>ورود</button><button role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setError(""); }}>ساخت حساب</button></div>
        <div className="form-title"><span>فضای کاری امن شما</span><h2>{mode === "login" ? "خوش آمدید" : "شروع با دیدبان مالی"}</h2><p>{mode === "login" ? "برای ادامه وارد حساب خود شوید." : "حساب مدیر و فضای کاری اولیه را بسازید."}</p></div>
        <form onSubmit={submit} className="auth-form">
          {mode === "register" && <><label>نام و نام خانوادگی<input name="full_name" autoComplete="name" required minLength={2} placeholder="مثلاً مهسا کریمی" /></label><label>نام فضای کاری <span>(اختیاری)</span><input name="workspace_name" placeholder="مثلاً گروه مالی آریا" /></label></>}
          <label>{mode === "login" ? "ایمیل یا نام کاربری" : "ایمیل کاری"}<input name="email" type={mode === "login" ? "text" : "email"} dir="ltr" autoComplete="email" required placeholder={mode === "login" ? "admin یا name@company.ir" : "name@company.ir"} /></label>
          <label>رمز عبور<input name="password" type="password" dir="ltr" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 12 : 1} placeholder={mode === "register" ? "حداقل ۱۲ نویسه" : "رمز عبور"} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={busy}>{busy ? "کمی صبر کنید…" : mode === "login" ? "ورود به دیدبان" : "ساخت حساب امن"}</button>
        </form>
        <p className="security-note"><Icon name="shield" />اطلاعات نشست در کوکی امن نگهداری می‌شود.</p>
      </div>
    </section>
  </main>;
}
