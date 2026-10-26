"use client";
import { ErrorState } from "@/components/ui/states";
export default function ErrorBoundary({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto max-w-lg p-7 pt-20">
      <ErrorState
        message="نمایش صفحه کامل نشد؛ دوباره تلاش کنید."
        onRetry={retry}
      />
    </main>
  );
}
