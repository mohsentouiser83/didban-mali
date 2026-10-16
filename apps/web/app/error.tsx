"use client";
import { ErrorState } from "@/components/ui/financial/error-state";

export default function ErrorBoundary({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main dir="rtl" className="flex min-h-[60vh] items-center justify-center p-6">
    <ErrorState title="این بخش بارگذاری نشد" onRetry={retry} linkToDataCenter={{ href: "/", label: "بازگشت به پیشخوان" }}>
      {error.digest && <code className="text-xs text-muted-foreground">کد پیگیری: {error.digest}</code>}
    </ErrorState>
  </main>;
}
