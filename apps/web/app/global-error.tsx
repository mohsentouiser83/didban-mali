"use client";
import { ErrorState } from "@/components/ui/financial/error-state";
import "./globals.css";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="fa" dir="rtl"><head><title>سامانه بارگذاری نشد | دیدبان مالی</title></head><body className="flex min-h-screen items-center justify-center bg-background p-6 font-sans text-foreground">
    <ErrorState title="سامانه بارگذاری نشد" onRetry={retry} retryLabel="بازنشانی سامانه">
      {error.digest && <code className="text-xs text-muted-foreground">کد پیگیری: {error.digest}</code>}
    </ErrorState>
  </body></html>;
}
