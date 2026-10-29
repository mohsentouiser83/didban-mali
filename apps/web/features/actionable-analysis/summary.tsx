"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, message } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { formatDate, formatTime } from "@/lib/dates";
import type { Proposal } from "./view";
export function ActionableSummary({ company }: { company: string }) {
  const query = useQuery({
    queryKey: ["actionable-overview", company],
    queryFn: ({ signal }) =>
      api.get<{
        report_id: string | null;
        as_of_date: string | null;
        created_at: string | null;
        items: Proposal[];
      }>(`/api/v1/companies/${company}/actionable-summary`, signal),
  });
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        message={message(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  if (!query.data.report_id) return null;
  const important = query.data.items
    .filter((item) => item.content.priority === "high")
    .slice(0, 3);
  const date = query.data.as_of_date
    ? formatDate(query.data.as_of_date)
    : query.data.created_at
      ? formatTime(query.data.created_at)
      : "تاریخ ناموجود";
  return (
    <ActionableSummaryView company={company} date={date} items={important} />
  );
}
function ActionableSummaryView({
  company,
  date,
  items,
}: {
  company: string;
  date: string;
  items: Proposal[];
}) {
  return (
    <section className="mt-5 rounded-panel border border-border bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">موارد مهم برای بررسی</h2>
        <Button variant="ghost" asChild>
          <Link href={`/companies/${company}/actionable-analysis`}>
            همه پیشنهادها
          </Link>
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">طبق گزارش {date}</p>
      {items.length ? (
        <ul className="mt-4 space-y-4">
          {items.map((item) => (
            <li key={item.id}>
              <p className="font-medium">{item.content.title}</p>
              <p className="mt-1 text-sm text-muted">{item.content.action}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          در این نسخه، پیشنهاد با اولویت بالا ثبت نشده است.
        </p>
      )}
    </section>
  );
}
