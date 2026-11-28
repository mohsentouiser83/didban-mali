"use client";
import { ErrorState } from "@/components/ui/content-states";
export default function ErrorBoundary() {
  return <ErrorState message="نمایش این صفحه ممکن نشد." />;
}
