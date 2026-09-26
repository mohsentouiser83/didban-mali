"use client";

import type React from "react";
import { useEffect } from "react";
import { AlertOctagon, RefreshCw } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps): React.ReactNode {
  useEffect(() => {
    console.error("Critical Global App Error:", error);
  }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <body className="flex min-h-screen flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 text-center font-sans antialiased text-slate-900 dark:text-slate-100">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-600 mb-6 shadow-sm">
          <AlertOctagon className="h-8 w-8" />
        </div>

        <span className="inline-block rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 px-3 py-1 text-xs font-semibold mb-3">
          خطای سیستمی در سطح برنامه
        </span>

        <h1 className="text-2xl font-bold tracking-tight text-balance max-w-md">
          سامانه دیدبان مالی موقتاً با مشکل مواجه شد
        </h1>

        <p className="mt-3 max-w-md text-sm text-slate-600 dark:text-slate-400 leading-relaxed text-balance">
          امنیت تراکنش‌ها و پایگاه داده حفظ شده است. لطفاً صفحه را بازنشانی کنید. در صورت تکرار با مدیر سیستم تماس بگیرید.
        </p>

        {error.digest && (
          <code className="mt-4 rounded bg-slate-200 dark:bg-slate-800 px-2 py-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
            شناسه رهگیری: {error.digest}
          </code>
        )}

        <div className="mt-8">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>بازنشانی سامانه</span>
          </button>
        </div>
      </body>
    </html>
  );
}
