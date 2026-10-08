"use client";

import type React from "react";
import { useEffect } from "react";
import { AlertOctagon, RefreshCw } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({
  error,
  reset,
}: GlobalErrorProps): React.ReactNode {
  useEffect(() => {
    console.error("Critical Global App Error:", error);
  }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <body className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center font-sans antialiased text-slate-900">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[var(--ds-card-radius)] bg-ds-danger/10 text-ds-danger mb-6 shadow-[var(--ds-shadow-sm)]">
          <AlertOctagon className="h-8 w-8" />
        </div>

        <span className="inline-block rounded-full bg-ds-danger/10 text-ds-danger px-3 py-1 text-xs font-semibold mb-3">
          خطای سیستمی در سطح برنامه
        </span>

        <h1 className="text-2xl font-bold tracking-normal text-balance max-w-md">
          سامانه دیدبان مالی موقتاً با مشکل مواجه شد
        </h1>

        <p className="mt-3 max-w-md text-sm text-slate-600 leading-relaxed text-balance">
          امنیت تراکنش‌ها و پایگاه داده حفظ شده است. لطفاً صفحه را بازنشانی
          کنید. در صورت تکرار با مدیر سیستم تماس بگیرید.
        </p>

        {error.digest && (
          <code className="mt-4 rounded bg-slate-200 px-2 py-1 text-[11px] font-mono text-slate-600">
            شناسه رهگیری: {error.digest}
          </code>
        )}

        <div className="mt-8">
          <Button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-lg bg-ds-success px-5 py-2.5 text-sm font-semibold text-white shadow-[var(--ds-shadow-sm)] hover:bg-ds-success focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>بازنشانی سامانه</span>
          </Button>
        </div>
      </body>
    </html>
  );
}
