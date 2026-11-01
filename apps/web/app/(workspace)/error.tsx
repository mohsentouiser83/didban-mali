"use client";
import { ErrorState } from "@/components/ui/content-states";
export default function ErrorBoundary({ retry }: { retry: () => void }) {
  return <ErrorState message="نمایش این صفحه ممکن نشد." onRetry={retry} />;
}
