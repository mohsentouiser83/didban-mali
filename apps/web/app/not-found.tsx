import type React from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight } from "@/components/ui/icons";

import { Button } from "@/components/ui/button";

export default function NotFound(): React.ReactNode {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center text-foreground"
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[var(--ds-card-radius)] bg-destructive/10 text-destructive mb-6 shadow-[var(--ds-shadow-sm)]">
        <AlertCircle className="h-8 w-8" />
      </div>

      <span className="inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground mb-4">
        خطای ۴۰۴
      </span>

      <h1 className="text-2xl font-bold tracking-normal sm:text-3xl text-balance max-w-md">
        صفحه مورد نظر یافت نشد
      </h1>

      <p className="mt-3 max-w-md text-sm text-muted-foreground leading-relaxed text-balance">
        آدرس وارد شده معتبر نیست یا صفحه حذف شده است. لطفاً صحت نشانی را بررسی
        کنید یا به داشبورد اصلی بازگردید.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg" className="gap-2">
          <Link href="/">
            <span>بازگشت به پیشخوان دیدبان مالی</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
