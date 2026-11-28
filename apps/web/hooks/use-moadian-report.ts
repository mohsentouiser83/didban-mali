"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { api } from "@/lib/api";
import type { MoadianTransmission, MoadianTransmissions } from "@/lib/moadian-transmissions";
import { tehranToday } from "@/lib/native-invoices";
import { asciiDigits, displayDate } from "@/lib/utils";
import { usePagedResource } from "./use-paged-resource";
import { useWorkspace } from "./workspace";

export const moadianReportStates = {
  queued: { label: "در صف ارسال", tone: "primary" },
  unknown: { label: "در انتظار استعلام", tone: "warning" },
  accepted: { label: "پذیرفته‌شده", tone: "success" },
  rejected: { label: "ردشده", tone: "danger" },
  not_sent: { label: "ارسال‌نشده", tone: "neutral" },
  failed: { label: "خطا در ارسال", tone: "danger" },
} as const;

export function moadianReportState(status: string) {
  return moadianReportStates[status as keyof typeof moadianReportStates] ?? { label: status, tone: "neutral" as const };
}

export function useMoadianReport(initialQuery = "") {
  const workspace = useWorkspace();
  const [statusFilter, setStatusFilter] = useState("all");
  const [terms, setTerms] = useState(() => {
    const reference = asciiDigits(initialQuery.trim());
    return /^[A-Z0-9]{6}[A-F0-9]{15}[0-9]$/i.test(reference)
      ? { invoice_reference: "", tax_id: reference }
      : { invoice_reference: initialQuery, tax_id: "" };
  });
  const [periodId, setPeriodId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportRequest = useRef<AbortController | null>(null);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(terms)) {
    if (value.trim()) params.set(key, asciiDigits(value.trim()));
  }
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (periodId) params.set("period_id", periodId);
  const base = workspace.companyPath("moadian/transmissions");
  const path = base ? `${base}?${params}` : null;
  const resource = usePagedResource<MoadianTransmission, MoadianTransmissions>(path);
  const items = resource.data?.items ?? [];

  useEffect(() => () => exportRequest.current?.abort(), [path]);

  async function exportExcel() {
    if (!path || exporting) return;
    const controller = new AbortController();
    exportRequest.current = controller;
    setExporting(true);
    setExportError("");
    try {
      const rows: MoadianTransmission[] = [];
      let cursor: string | null = null;
      do {
        const page: MoadianTransmissions = await api(
          `${path}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          { signal: controller.signal },
        );
        rows.push(...page.items);
        cursor = page.next_cursor;
      } while (cursor && !controller.signal.aborted);
      if (controller.signal.aborted || !rows.length) return;
      const sheet = XLSX.utils.json_to_sheet(rows.map((item) => ({
        "شماره فاکتور": item.invoice_reference,
        "شناسه یکتای مالیاتی": item.tax_id ?? "",
        "دورهٔ مالی": item.period_name ?? "",
        "تاریخ ثبت": displayDate(item.created_at),
        "آخرین استعلام": item.last_inquiry_at ? displayDate(item.last_inquiry_at) : "",
        "وضعیت سامانه": moadianReportState(item.status).label,
        "کد رهگیری": item.reference_number ?? item.uid ?? "",
      })));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "صورتحساب‌های مؤدیان");
      XLSX.writeFile(workbook, `moadian-report-${tehranToday()}.xlsx`);
    } catch (error) {
      if (!controller.signal.aborted) {
        setExportError(error instanceof Error ? error.message : "دریافت گزارش کامل انجام نشد.");
      }
    } finally {
      if (exportRequest.current === controller) {
        exportRequest.current = null;
        setExporting(false);
      }
    }
  }

  return {
    workspace, resource, items, statusFilter, setStatusFilter,
    columnFilter: (key: keyof typeof terms) => ({
      activeFilter: terms[key] ? { textCondition: terms[key] } : undefined,
      isActive: !!terms[key],
      maxLength: key === "tax_id" ? 22 : 120,
      onApply: (filter: { textCondition?: string } | null) =>
        setTerms((previous) => ({ ...previous, [key]: filter?.textCondition ?? "" })),
    }),
    periodId, setPeriodId, exportExcel, exporting, exportError,
  };
}
