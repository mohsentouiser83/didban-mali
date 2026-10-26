"use client";
import { ControlLabel } from "@/components/ui/field-layout";
import { FieldError, FieldDescription } from "@/components/ui/field";
import { Form, FormMessage } from "@/components/ui/form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import {
  Building2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  User as UserIcon,
} from "@/components/ui/icons";


import { Mark } from "./icons";

import { useAuthScreen, type AuthMode } from "./use-auth-screen";
export type { AuthMode } from "./use-auth-screen";
export interface AuthScreenProps {
  initialMode?: AuthMode;
}

export function AuthScreen({ initialMode = "login" }: AuthScreenProps) {
  const { mode, busy, error, fieldErrors, values, showPassword, setShowPassword, capsLock, setCapsLock, recoveryOpen, setRecoveryOpen, errorRef, recoveryRef, changeMode, updateField, submit } = useAuthScreen(initialMode);

  return (
    <main className="pp-auth ds-root auth-shell auth-shell-centered relative min-h-screen flex flex-col items-center justify-center p-4 bg-background ds-grid-bg">
      {/* Centered Panel */}
      <div className="auth-panel w-full max-w-md flex flex-col items-center relative z-10">
        <Card
          className="auth-card w-full p-6 sm:p-8 rounded-[var(--ds-card-radius)] bg-card/90  border border-border shadow-[var(--ds-shadow-xl)]"
          data-mode={mode}
        >
          {/* Brand Header */}
          <div className="auth-brand-header flex flex-col items-center text-center mb-6">
            <div className="brand flex items-center gap-2.5">
              <Mark />
              <span className="brand-title font-bold text-xl text-foreground">
                دیدبان مالی
              </span>
            </div>
            <span className="kicker text-xs font-semibold text-primary mt-1">
              سامانه عملیات و کنترل مالی
            </span>
          </div>

          {/* Mode Switcher */}
          <Tabs
            variant="segmented"
            value={mode}
            onValueChange={(value) => changeMode(value as AuthMode)}
            className="w-full"
          >
            <TabsList
              className="grid grid-cols-2 min-h-13 p-1 bg-muted rounded-[var(--ds-card-radius)] border border-border/70 mb-6 w-full"
              aria-label="انتخاب نوع ورود"
            >
              <TabsTrigger value="login" className="h-full min-h-11 text-xs sm:text-sm">ورود</TabsTrigger>
              <TabsTrigger value="register" className="h-full min-h-11 text-xs sm:text-sm">ساخت حساب</TabsTrigger>
            </TabsList>

            <TabsContent
              key={mode}
              value={mode}
              className="mt-0"
            >
              <div className="form-title text-center mb-6 space-y-1">
                <span className="text-xs font-semibold text-primary">
                  فضای کاری امن شما
                </span>
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                  {mode === "login" ? "خوش آمدید" : "شروع با دیدبان مالی"}
                </h2>
              </div>

              <Form
                onSubmit={submit}
                className="auth-form space-y-4"
                noValidate
              >
                {mode === "register" && (
                  <>
                    <div className="space-y-1.5">
                      <ControlLabel htmlFor="auth-full_name" icon={UserIcon}>نام و نام خانوادگی</ControlLabel>
                      <div className="auth-input-wrap relative flex items-center">
                        <Input
                          id="auth-full_name"
                          name="full_name"
                          autoComplete="name"
                          value={values.full_name}
                          onChange={(event) =>
                            updateField("full_name", event.target.value)
                          }
                          aria-invalid={Boolean(fieldErrors.full_name)}
                          aria-describedby={
                            fieldErrors.full_name
                              ? "auth-full_name-error"
                              : undefined
                          }
                          placeholder="مثلاً مهسا کریمی"
                          className="text-start"
                        />
                      </div>
                      {fieldErrors.full_name && (
                        <FieldError
                          id="auth-full_name-error"
                        >
                          {fieldErrors.full_name}
                        </FieldError>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                        <ControlLabel htmlFor="auth-workspace_name" icon={Building2}>نام فضای کاری</ControlLabel>
                        <span className="text-[11px] font-normal text-muted-foreground">
                          اختیاری
                        </span>
                      </div>
                      <div className="auth-input-wrap relative flex items-center">
                        <Input
                          id="auth-workspace_name"
                          name="workspace_name"
                          value={values.workspace_name}
                          onChange={(event) =>
                            updateField("workspace_name", event.target.value)
                          }
                          aria-invalid={Boolean(fieldErrors.workspace_name)}
                          aria-describedby={
                            fieldErrors.workspace_name
                              ? "auth-workspace_name-error"
                              : "auth-workspace_name-hint"
                          }
                          placeholder="مثلاً گروه مالی آریا"
                          className="text-start"
                        />
                      </div>
                      <FieldDescription
                        id="auth-workspace_name-hint"
                      >
                        فضای مشترک شرکت، اعضا و گزارش‌ها
                      </FieldDescription>
                      {fieldErrors.workspace_name && (
                        <FieldError
                          id="auth-workspace_name-error"
                        >
                          {fieldErrors.workspace_name}
                        </FieldError>
                      )}
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <ControlLabel htmlFor="auth-email" icon={Mail}>{mode === "login" ? "ایمیل یا نام کاربری" : "ایمیل کاری"}</ControlLabel>
                  <div className="auth-input-wrap relative flex items-center">
                    <Input
                      id="auth-email"
                      name="email"
                      type={mode === "login" ? "text" : "email"}
                      dir={values.email ? "ltr" : "rtl"}
                      autoComplete="email"
                      inputMode={mode === "login" ? "text" : "email"}
                      value={values.email}
                      onChange={(event) =>
                        updateField("email", event.target.value)
                      }
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={
                        fieldErrors.email ? "auth-email-error" : undefined
                      }
                      placeholder="ایمیل یا نام کاربری"
                      className="text-start"
                    />
                  </div>
                  {fieldErrors.email && (
                    <FieldError
                      id="auth-email-error"
                    >
                      {fieldErrors.email}
                    </FieldError>
                  )}
                </div>

                <div className="auth-field space-y-1.5">
                  <div className="h-6">
                    <ControlLabel htmlFor="auth-password" icon={Lock}>رمز عبور</ControlLabel>
                  </div>
                  <div className="password-input-wrap relative flex items-center">
                    <Input
                      id="auth-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      dir={values.password ? "ltr" : "rtl"}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      value={values.password}
                      onChange={(event) =>
                        updateField("password", event.target.value)
                      }
                      onKeyDown={(event) =>
                        setCapsLock(event.getModifierState("CapsLock"))
                      }
                      onKeyUp={(event) =>
                        setCapsLock(event.getModifierState("CapsLock"))
                      }
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
                      className="pe-12 text-start"
                    />
                    <Button
                      variant="surface"
                      size="icon"
                      motion="none"
                      type="button"
                      className="absolute end-0 top-0 size-11 min-h-11 min-w-11 text-muted-foreground hover:text-foreground"
                      aria-label={
                        showPassword ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((shown) => !shown)}
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" aria-hidden="true" />
                      ) : (
                        <Eye className="size-4" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                    {mode === "login" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        className="forgot-password hover:underline font-normal cursor-pointer"
                        aria-label="رمز را فراموش کرده‌اید؟"
                        onClick={() => {
                          const nextOpen = !recoveryOpen;
                          setRecoveryOpen(nextOpen);
                          if (nextOpen)
                            requestAnimationFrame(() =>
                              recoveryRef.current?.focus(),
                            );
                        }}
                      >
                        رمز را فراموش کرده‌اید؟
                      </Button>
                    )}
                  {mode === "register" && (
                    <FieldDescription
                      id="auth-password-hint"
                    >
                      حداقل ۱۲ نویسه؛ بهتر است از عبارت طولانی و منحصربه‌فرد
                      استفاده کنید.
                    </FieldDescription>
                  )}
                  {capsLock && (
                    <FormMessage variant="warning" id="auth-caps-lock">Caps Lock روشن است.</FormMessage>
                  )}
                  {fieldErrors.password && (
                    <FieldError
                      id="auth-password-error"
                    >
                      {fieldErrors.password}
                    </FieldError>
                  )}
                </div>

                {mode === "login" && recoveryOpen && (
                  <FormMessage
                    ref={recoveryRef}
                    variant="info" className="flex items-start gap-3"
                    id="password-recovery"
                    tabIndex={-1}
                  >
                    <ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                      <AlertTitle className="font-bold text-foreground">
                        راهنمای بازیابی رمز
                      </AlertTitle>
                      <AlertDescription className="text-muted-foreground leading-relaxed">
                        بازیابی ایمیلی در نسخهٔ فعلی فعال نیست. برای بازنشانی
                        امن، با مدیر سامانه یا تیم استقرار سازمان خود تماس
                        بگیرید.
                      </AlertDescription>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRecoveryOpen(false)}
                      aria-label="بستن راهنمای بازیابی"
                      className=""
                    >
                      بستن
                    </Button>
                  </FormMessage>
                )}

                {error && (
                  <FormMessage
                    ref={errorRef}
                    variant="destructive"
                    className=""
                    tabIndex={-1}
                  >
                    <AlertTitle className="font-bold">{error}</AlertTitle>
                  </FormMessage>
                )}

                <Button
                  type="submit"
                  className="primary-button w-full "
                  disabled={busy}
                  aria-busy={busy}
                >
                  {busy
                    ? "کمی صبر کنید…"
                    : mode === "login"
                      ? "ورود به دیدبان"
                      : "ساخت حساب امن"}
                </Button>
              </Form>
            </TabsContent>
          </Tabs>


          <section className="auth-assurance mt-4 text-xs text-muted-foreground border-t border-border/60 pt-4">
            <h3 className="text-center font-medium py-1">
              حریم خصوصی، امنیت و پشتیبانی
            </h3>
            <div className="mt-3 space-y-2.5 p-3 rounded-[var(--ds-card-radius)] bg-muted/40 text-[11px] leading-relaxed">
              <section>
                <strong className="block font-semibold text-foreground mb-0.5">
                  حریم خصوصی و امنیت
                </strong>
                <p>
                  نشست با کوکی امن نگهداری می‌شود و دادهٔ شرکت‌ها از یکدیگر
                  تفکیک شده است.
                </p>
              </section>
              <section>
                <strong className="block font-semibold text-foreground mb-0.5">
                  شرایط استفاده
                </strong>
                <p>
                  این نسخه در مرحلهٔ MVP سازمانی است؛ شرایط نهایی پیش از انتشار
                  عمومی ارائه می‌شود.
                </p>
              </section>
              <section>
                <strong className="block font-semibold text-foreground mb-0.5">
                  پشتیبانی
                </strong>
                <p>
                  برای دسترسی یا بازیابی حساب، با مدیر سامانه یا تیم استقرار
                  سازمان خود تماس بگیرید.
                </p>
              </section>
            </div>
          </section>
        </Card>
      </div>
    </main>
  );
}
