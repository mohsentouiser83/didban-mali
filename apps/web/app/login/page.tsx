"use client";
import { PageTitle } from "@/components/ui/page-title";
import { LockKeyIcon as TitleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useLogin } from "@/hooks/use-login";
import {
  ChartLineUpIcon,
  EnvelopeSimpleIcon,
  LockKeyIcon,
} from "@phosphor-icons/react";
export default function Login() {
  const { email, setEmail, password, setPassword, busy, error, submit } =
    useLogin();
  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="grid size-12 place-items-center rounded-panel bg-primary text-white">
            <ChartLineUpIcon size={28} weight="duotone" aria-hidden />
          </span>
          <span className="font-display text-base font-medium">دیدبان مالی</span>
        </div>
        <section className="rounded-dialog border border-border bg-surface p-5 shadow-action sm:p-7">
          <PageTitle icon={TitleIcon} className="mb-7">
            ورود به فضای مالی
          </PageTitle>
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Field id="login-email" label="ایمیل" icon={EnvelopeSimpleIcon}>
              <Input
                id="login-email"
                type="email"
                dir="ltr"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
            </Field>
            <Field id="login-password" label="رمز عبور" icon={LockKeyIcon}>
              <Input
                id="login-password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </Field>
            <FormMessage error>{error}</FormMessage>
            <Button type="submit" busy={busy} className="w-full">
              ورود
            </Button>
          </Form>
          <p className="mt-6 text-center text-xs text-muted">
            دسترسی حساب از مدیر سازمان دریافت می‌شود.
          </p>
        </section>
      </div>
    </main>
  );
}
