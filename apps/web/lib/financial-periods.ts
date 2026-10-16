"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getDateLib } from "@daypicker/persian";
import { dateFromISO, dateToISO } from "./persian-date";
import type { CustomerReceivableItem, ReceivableInvoiceItem } from "./product-types";

export type DateRange = { start_date: string; end_date: string };
export type FinancialPeriod = DateRange & { id: string; name: string };
export type PeriodReport = DateRange & {
  cash: {
    opening_balance_irr: string | null; closing_balance_irr: string | null;
    inflows_irr: string | null; outflows_irr: string | null;
    warnings: string[];
    days: { date: string; inflows_irr: string; outflows_irr: string; balance_irr: string | null }[];
  };
  receivables: {
    opening_balance_irr: string | null; closing_balance_irr: string | null;
    sales_irr: string | null; receipts_irr: string | null; overdue_irr: string | null;
    history_complete: boolean; warnings: string[];
    buckets: { bucket_key: string; label_fa: string; amount_irr: string; invoice_count: number; share_percentage: number }[];
    customers: CustomerReceivableItem[]; invoices: ReceivableInvoiceItem[];
  };
};
export type InvoiceHistory = {
  invoice_id: string; invoice_no: string; customer_name: string; issue_date: string;
  gross_amount_irr: string; paid_amount_irr: string | null; complete: boolean; version: number;
  receipts: { id: string; received_on: string; amount_irr: string; reference: string | null }[];
};

export function validRange(range: DateRange): boolean {
  const start = dateFromISO(range.start_date), end = dateFromISO(range.end_date);
  return !!start && !!end && start <= end && (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000 <= 732;
}
export function currentRange(kind: "month" | "quarter" | "year" | "upcomingMonth" = "month"): DateRange {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = dateFromISO(today)!;
  const calendar = getDateLib();
  if (kind === "upcomingMonth") return { start_date: today, end_date: dateToISO(calendar.addMonths(date, 1)) };
  let start = calendar.startOfMonth(date);
  if (kind === "year") start = calendar.startOfYear(date);
  if (kind === "quarter") start = calendar.setMonth(calendar.startOfYear(date), Math.floor(calendar.getMonth(date) / 3) * 3);
  return { start_date: dateToISO(start), end_date: today };
}
const eventName = "didban-financial-period";
function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback); window.addEventListener("popstate", callback); window.addEventListener("storage", callback);
  return () => { window.removeEventListener(eventName, callback); window.removeEventListener("popstate", callback); window.removeEventListener("storage", callback); };
}
function storedRange(companyId: string): string {
  const query = new URLSearchParams(window.location.search);
  const fromURL = { start_date: query.get("from") ?? "", end_date: query.get("to") ?? "" };
  if (window.location.pathname.includes(`/companies/${companyId}/`) && validRange(fromURL)) return JSON.stringify(fromURL);
  try {
    const saved = localStorage.getItem(`didban.period.v1.${companyId}`);
    if (saved && validRange(JSON.parse(saved))) return saved;
  } catch { /* Storage may be disabled. URL selection remains available. */ }
  return "";
}
export function useFinancialRange(companyId: string) {
  const snapshot = useSyncExternalStore(subscribe, useCallback(() => storedRange(companyId), [companyId]), () => "");
  const range: DateRange = snapshot ? JSON.parse(snapshot) : currentRange();
  useEffect(() => {
    const stored = storedRange(companyId);
    const selected: DateRange = stored ? JSON.parse(stored) : currentRange();
    const url = new URL(window.location.href);
    if (!url.pathname.includes(`/companies/${companyId}/`)) return;
    url.searchParams.set("from", selected.start_date); url.searchParams.set("to", selected.end_date);
    window.history.replaceState(null, "", url);
  }, [companyId, snapshot]);
  const setRange = useCallback((next: DateRange) => {
    if (!validRange(next)) return;
    try { localStorage.setItem(`didban.period.v1.${companyId}`, JSON.stringify(next)); } catch { /* Keep the URL usable without storage. */ }
    const url = new URL(window.location.href);
    url.searchParams.set("from", next.start_date); url.searchParams.set("to", next.end_date);
    window.history.replaceState(null, "", url);
    window.dispatchEvent(new Event(eventName));
  }, [companyId]);
  return { range, setRange };
}
