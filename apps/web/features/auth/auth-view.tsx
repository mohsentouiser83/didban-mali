"use client";
import { useState, type ReactNode, type FormEvent } from "react";
import Link from "next/link";
import { ArrowUpLeft, Eye, EyeOff, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Field, Input, FormMessage } from "@/components/ui/field";
export function AuthFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="relative grid min-h-dvh lg:grid-cols-2">
      <div className="relative flex flex-col justify-between overflow-hidden bg-accent/60 p-7 lg:p-14">
        <Link href="/login" className="flex w-fit items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-white">
            <Sparkles size={23} aria-hidden />
          </span>
          <span className="font-heading text-base font-medium">
            دیدبان مالی
          </span>
        </Link>
        <div
          className="absolute -start-20 top-1/4 size-80 rounded-full bg-primary/8 blur-3xl"
          aria-hidden
        />
        <div className="relative hidden max-w-lg space-y-8 py-20 lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-surface/70 px-4 py-1.5 text-xs text-primary">
            <Sparkles size={14} aria-hidden />
            فضای مالی سازمان شما
          </div>
          <h2 className="font-heading text-[26px] font-medium leading-[1.9] text-balance">
            نگاه روشن‌تر به کسب‌وکار،
            <br />
            با خیال آسوده‌تر.
          </h2>
          <div className="flex items-center gap-3 text-muted">
            <span className="flex size-11 items-center justify-center rounded-control bg-surface">
              <ShieldCheck size={22} className="text-primary" aria-hidden />
            </span>
            <p>دسترسی مشخص، برای هر شرکت.</p>
          </div>
        </div>
        <span className="hidden text-xs text-muted lg:block">
          دیدبان مالی · نصب اختصاصی سازمان
        </span>
      </div>
      <div className="flex items-center justify-center px-5 py-10 lg:p-14">
        <section className="w-full max-w-[380px] space-y-8 motion-safe:animate-reveal">
          <div>
            <span
              className="mb-4 block h-1 w-9 rounded-full bg-primary"
              aria-hidden
            />
            <h1 className="font-heading text-[26px] font-medium">{title}</h1>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
export function PasswordInput({
  id,
  label = "رمز عبور",
  name,
  minLength = 1,
  autoComplete = "current-password",
  disabled = false,
}: {
  id: string;
  label?: string;
  name: string;
  minLength?: number;
  autoComplete?: string;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field id={id} label={label}>
      <div className="relative">
        <Input
          id={id}
          name={name}
          dir="ltr"
          type={visible ? "text" : "password"}
          className="pe-14"
          required
          minLength={minLength}
          maxLength={1024}
          autoComplete={autoComplete}
          disabled={disabled}
        />
        <Button
          variant="ghost"
          className="absolute end-0 top-0 min-h-12 px-3"
          aria-label={visible ? "پنهان کردن رمز" : "نمایش رمز"}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </Button>
      </div>
    </Field>
  );
}
export function LoginView({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <AuthFrame title="خوش آمدید">
      <Form onSubmit={onSubmit} className="space-y-5">
        <Field id="email" label="ایمیل">
          <Input
            id="email"
            name="email"
            dir="ltr"
            type="email"
            required
            maxLength={254}
            autoComplete="username"
            placeholder="name@company.com"
            disabled={busy}
          />
        </Field>
        <PasswordInput id="password" name="password" disabled={busy} />
        <FormMessage>{error}</FormMessage>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "در حال ورود…" : "ورود به فضای کار"}
          <ArrowUpLeft size={18} aria-hidden />
        </Button>
      </Form>
      <div className="flex flex-wrap justify-between gap-3 text-xs">
        <Link
          className="rounded-lg text-primary underline-offset-4 hover:underline focus-visible:outline-primary"
          href="/accept-invitation"
        >
          فعال‌سازی دعوت
        </Link>
        <Link
          className="rounded-lg text-muted underline-offset-4 hover:underline focus-visible:outline-primary"
          href="/reset-password"
        >
          بازیابی رمز عبور
        </Link>
      </div>
    </AuthFrame>
  );
}
export function ActivationView({
  mode,
  busy,
  error,
  done,
  onSubmit,
}: {
  mode: "invite" | "reset";
  busy: boolean;
  error?: string;
  done: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <AuthFrame
      title={mode === "invite" ? "فعال‌سازی حساب" : "بازیابی رمز عبور"}
    >
      {done ? (
        <div className="space-y-6">
          <FormMessage success>رمز ثبت شد؛ اکنون وارد حساب شوید.</FormMessage>
          <Button asChild className="w-full">
            <Link href="/login">ورود به حساب</Link>
          </Button>
        </div>
      ) : (
        <Form className="space-y-5" onSubmit={onSubmit}>
          <Field
            id="token"
            label={mode === "invite" ? "کد دعوت" : "کد بازیابی"}
          >
            <Input
              id="token"
              name="token"
              dir="ltr"
              autoComplete="off"
              required
              maxLength={4000}
              disabled={busy}
            />
          </Field>
          <PasswordInput
            id="new-password"
            label="رمز جدید"
            name="new_password"
            minLength={12}
            autoComplete="new-password"
            disabled={busy}
          />
          <p className="text-xs text-muted">
            رمز حداقل ۱۲ نویسه باشد. کد را از مدیر سازمان بگیرید.
          </p>
          <FormMessage>{error}</FormMessage>
          <Button className="w-full" type="submit" disabled={busy}>
            {busy ? "در حال ثبت…" : "ثبت رمز"}
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">بازگشت به ورود</Link>
          </Button>
        </Form>
      )}
    </AuthFrame>
  );
}
