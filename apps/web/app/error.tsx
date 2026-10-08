"use client";

import type React from "react";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "@/components/ui/icons";
import Link from "next/link";

import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({
  error,
  reset,
}: ErrorProps): React.ReactNode {
  useEffect(() => {
    // Grounding in error reporting
    console.error("UI Uncaught Segment Error:", error);
  }, [error]);

  return (
    <div
      dir="rtl"
      className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center text-foreground"
    >
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[var(--ds-card-radius)] bg-ds-warning/10 text-ds-warning mb-6 shadow-[var(--ds-shadow-sm)]">
        <AlertTriangle className="h-8 w-8" />
      </div>

      <span className="inline-block rounded-full bg-ds-warning/10 text-ds-warning px-3 py-1 text-xs font-semibold mb-3">
        خطای پردازش داده یا ارتباط شبکه
      </span>

      <h1 className="text-xl font-bold tracking-normal sm:text-2xl text-balance max-w-md">
        در بارگذاری این بخش مشکلی رخ داد
      </h1>

      <p className="mt-3 max-w-md text-sm text-muted-foreground leading-relaxed text-balance">
        عملیات مالی با شکست ناخواسته مواجه نشد و داده‌ها امن هستند. می‌توانید
        دوباره تلاش کنید یا به صفحه قبل بازگردید.
      </p>

      {error.digest && (
        <code className="mt-4 rounded bg-muted px-2 py-1 text-[11px] font-mono text-muted-foreground">
          کد پیگیری خطا: {error.digest}
        </code>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()} size="default" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          <span>تلاش مجدد</span>
        </Button>
        <Button asChild variant="outline" size="default" className="gap-2">
          <Link href="/">
            <Home className="h-4 w-4" />
            <span>بازگشت به پیشخوان</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
