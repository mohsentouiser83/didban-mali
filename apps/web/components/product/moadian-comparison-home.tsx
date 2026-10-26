"use client";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingState, toPersianDigits } from "@/components/ui/financial";
import { Skeleton } from "@/components/ui/skeleton";
import { MoadianComparisonHistory } from "./moadian-comparison-history";
import type { useMoadianComparison } from "./use-moadian-comparison";

type Controller = ReturnType<typeof useMoadianComparison>;
export function MoadianComparisonHome({ c, companyId, onNew, onOpen }: { c: Controller; companyId: string; onNew: () => void; onOpen: (id: string) => void }) {
  if (c.historyLoading) return <LoadingState aria-label="دریافت تطبیق‌ها" variant="details"><Skeleton className="h-7 w-48" /><Skeleton className="h-40 w-full" /></LoadingState>;
  const ready = c.canStart;
  const hasInternal = c.hasInternal;
  return <div className="space-y-6 motion-safe:animate-[workspace-enter_180ms_ease-out_both]">
    {c.historyError ? <ErrorState onRetry={c.refreshHistory}>{c.historyError}</ErrorState> : c.history.length ? <MoadianComparisonHistory runs={c.history} busy={c.loading} onOpen={onOpen} /> : <EmptyState title="هنوز تطبیقی انجام نشده است" description={c.loadingFiles || c.filesError ? undefined : !hasInternal ? "فاکتورهای حسابداری برای مقایسه با مؤدیان موجود نیست." : !ready ? "فایل کارپوشه متناظر با فاکتورهای حسابداری موجود نیست." : undefined} action={c.loadingFiles || c.filesError ? undefined : ready ? { label: "شروع تطبیق", onClick: onNew } : { label: !hasInternal ? "تکمیل اسناد حسابداری" : "تکمیل اسناد مؤدیان", href: `/companies/${companyId}/imports` }} />}
    {c.filesError ? <ErrorState variant="compact" onRetry={c.refreshFiles}>{c.filesError}</ErrorState> : c.loadingFiles ? <LoadingState aria-label="بررسی منابع تطبیق" variant="details"><Skeleton className="h-20 w-full" /></LoadingState> : <section aria-label="آمادگی منابع تطبیق" className="grid gap-4 sm:grid-cols-2">{c.readiness.map((item) => <div key={item.direction} className="grid gap-3 rounded-[var(--ds-card-radius)] border border-border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">{item.direction === "sales" ? "فروش" : "خرید"}</h2><Badge variant={item.internal && item.portal ? "success" : "secondary"}>{!item.internal ? "حسابداری موجود نیست" : !item.portal ? "کارپوشه موجود نیست" : "آماده تطبیق"}</Badge></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">فایل فاکتور حسابداری</dt><dd className="mt-1">{toPersianDigits(item.internal)}</dd></div><div><dt className="text-muted-foreground">فایل کارپوشه</dt><dd className="mt-1">{toPersianDigits(item.portal)}</dd></div></dl></div>)}</section>}
  </div>;
}
