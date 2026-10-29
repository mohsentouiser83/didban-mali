"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { formatTime } from "@/lib/dates";
const labels: Record<string, string> = {
  accounting: "تحلیل حسابداری",
  cash: "نقد و بانک",
  balances: "مطالبات و بدهی‌ها",
  invoices: "خرید و فروش",
  settlements: "تسویه و تعهدات",
  moadian: "مؤدیان",
  forecast: "پیش‌بینی نقد",
  payroll: "حقوق‌ودستمزد",
  view: "مشاهده حقوق",
  manage: "مدیریت حقوق",
  approve: "تأیید حقوق",
};
export function useExtensionEvents(company: string) {
  const query = useInfiniteQuery({
    queryKey: ["extension-events", company],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"ExtensionAccessEventPage">>(
        `/api/v1/companies/${company}/extension-access-events?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  });
  const rows =
    query.data?.pages
      .flatMap((page) => page.items)
      .map((row) => ({
        id: row.id,
        subject:
          row.kind === "company_modules"
            ? "ماژول‌های شرکت"
            : `حقوق · ${row.recipient_name ?? "عضو پیشین"}`,
        actor: row.actor_name,
        date: formatTime(row.created_at),
        reason: row.reason,
        changes:
          Object.entries(row.after_value)
            .filter(
              ([key, value]) =>
                key in labels &&
                typeof value === "boolean" &&
                value !== (row.before_value[key] ?? false),
            )
            .map(
              ([key, value]) => `${labels[key]}: ${value ? "فعال" : "غیرفعال"}`,
            )
            .join("، ") || "بدون تغییر در مقادیر",
      })) ?? [];
  return { ...query, rows };
}
export type ExtensionEventRow = ReturnType<
  typeof useExtensionEvents
>["rows"][number];
