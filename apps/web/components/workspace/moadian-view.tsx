"use client";

import { useState } from "react";
import { ReceiptIcon as HeaderIcon, ArrowDownLeftIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import type { ParsedTableImport } from "@/components/ui/table-import-dialog";
import { Tabs } from "@/components/ui/tabs";
import { useFinancialView } from "@/hooks/use-financial-view";
import { api, type ComparisonRow, type ProcessingSession, type SourceFile } from "@/lib/api";
import { amount, displayDate, persian } from "@/lib/utils";
import { toast } from "sonner";
import { NoCompany, PageHeader, Panel } from "./page-parts";

interface MoadianRowItem {
  reference: string;
  tax_id: string;
  date: string;
  party: string;
  amount: string;
  vat_amount: string;
  status: string;
  difference: string;
}

const statusToneMap: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  "تایید شده": "success",
  "تایید سیستمی": "success",
  matched: "success",
  "رد شده": "danger",
  rejected: "danger",
  "باطل شده": "danger",
  cancelled: "danger",
  "عدم امکان واکنش": "warning",
  "در انتظار استعلام": "warning",
  pending: "warning",
  "عدم نیاز به واکنش": "neutral",
};

function parseMoadianExcel(parsed: ParsedTableImport): MoadianRowItem[] {
  if (!parsed.rows.length) return [];
  const headerMap: Record<string, number> = {};
  parsed.headers.forEach((h, i) => {
    headerMap[h.trim().toLowerCase()] = i;
  });

  const getCol = (names: string[]) => {
    for (const name of names) {
      for (const [h, idx] of Object.entries(headerMap)) {
        if (h.includes(name.toLowerCase())) return idx;
      }
    }
    return -1;
  };

  const taxIdIdx = getCol(["شماره مالیاتی صورت‌حساب", "شماره مالیاتی", "شناسه مالیاتی", "tax_id"]);
  const dateIdx = getCol(["تاریخ صدور صورت‌حساب", "تاریخ صدور", "تاریخ", "date"]);
  const totalIdx = getCol(["مجموع صورت‌حساب", "مبلغ کل", "مجموع", "مبلغ", "amount"]);
  const vatIdx = getCol(["مالیات بر ارزش افزوده", "ارزش افزوده", "مالیات", "vat"]);
  const statusIdx = getCol(["وضعیت صورت‌حساب", "وضعیت", "status"]);
  const partyIdx = getCol([
    "خریدار",
    "فروشنده",
    "نام شخص",
    "طرف حساب",
    "طرف‌حساب",
    "شناسه هویتی",
    "party",
  ]);
  const refIdx = getCol([
    "شماره مالیاتی صورت‌حساب مرجع",
    "شماره ارجاع",
    "شماره مرجع",
    "شماره فاکتور",
    "reference",
  ]);

  return parsed.rows.map((row, idx) => {
    const taxId = taxIdIdx >= 0 ? String(row[taxIdIdx] ?? "").trim() : "";
    const rawDate = dateIdx >= 0 ? String(row[dateIdx] ?? "").trim() : "";
    const rawAmount = totalIdx >= 0 ? String(row[totalIdx] ?? "").replace(/[,٬]/g, "").trim() : "0";
    const rawVat = vatIdx >= 0 ? String(row[vatIdx] ?? "").replace(/[,٬]/g, "").trim() : "0";
    const rawStatus = statusIdx >= 0 ? String(row[statusIdx] ?? "").trim() : "تایید شده";
    const party = partyIdx >= 0 ? String(row[partyIdx] ?? "").trim() : "";
    const ref = refIdx >= 0 && row[refIdx] ? String(row[refIdx]).trim() : taxId || `INV-${idx + 1}`;

    return {
      reference: ref,
      tax_id: taxId,
      date: rawDate,
      party,
      amount: rawAmount,
      vat_amount: rawVat,
      status: rawStatus || "تایید شده",
      difference: "0",
    };
  });
}

function normalizeManifestRows(rows: ComparisonRow[] = []): MoadianRowItem[] {
  return rows.map((r, idx) => ({
    reference: r.reference || r.invoice_id || `INV-${idx + 1}`,
    tax_id: r.tax_id || "",
    date: "",
    party: "",
    amount: String(r.amount || r.portal || r.internal || "0"),
    vat_amount: "0",
    status: r.status || r.state || "matched",
    difference: String(r.difference || "0"),
  }));
}

export function MoadianView() {
  const view = useFinancialView("moadian");
  if (!view.workspace.company) return <NoCompany />;
  return <MoadianContent key={view.workspace.company.id} view={view} />;
}

function MoadianContent({ view }: { view: ReturnType<typeof useFinancialView> }) {
  const { workspace } = view;
  const unit = workspace.unit;
  const companyId = workspace.company?.id;

  const [activeTab, setActiveTab] = useState<"sales" | "purchases">("sales");
  const [importedSales, setImportedSales] = useState<MoadianRowItem[]>(() => {
    if (typeof window === "undefined" || !companyId) return [];
    try {
      const savedSales = localStorage.getItem(`didban-moadian-sales:${companyId}`);
      return savedSales ? JSON.parse(savedSales) : [];
    } catch {
      return [];
    }
  });
  const [importedPurchases, setImportedPurchases] = useState<MoadianRowItem[]>(() => {
    if (typeof window === "undefined" || !companyId) return [];
    try {
      const savedPurchases = localStorage.getItem(`didban-moadian-purchases:${companyId}`);
      return savedPurchases ? JSON.parse(savedPurchases) : [];
    } catch {
      return [];
    }
  });

  const manifestSales = normalizeManifestRows(view.manifest?.details.moadian?.sales);
  const manifestPurchases = normalizeManifestRows(view.manifest?.details.moadian?.purchases);

  const displaySales = manifestSales.length > 0 ? manifestSales : importedSales;
  const displayPurchases = manifestPurchases.length > 0 ? manifestPurchases : importedPurchases;

  const handleImportSales = async (parsed: ParsedTableImport) => {
    const rows = parseMoadianExcel(parsed);
    if (!rows.length) {
      toast.error("ردیف معتبری در فایل اکسل یافت نشد.");
      return;
    }
    setImportedSales(rows);
    if (companyId) {
      try {
        localStorage.setItem(`didban-moadian-sales:${companyId}`, JSON.stringify(rows));
      } catch {
        // Ignore storage errors
      }
    }
    toast.success(`${persian(rows.length)} صورتحساب فروش مؤدیان با موفقیت وارد جدول شد.`);

    if (parsed.file && companyId) {
      try {
        const session = await api<ProcessingSession>(
          workspace.companyPath("processing-sessions")!,
          { method: "POST", body: { period_id: workspace.periodId || null } },
        );
        const body = new FormData();
        body.append("file", parsed.file);
        const uploadedFile = await api<SourceFile>(
          workspace.companyPath(`processing-sessions/${session.id}/files`)!,
          { method: "POST", body },
        );
        await api(workspace.companyPath(`processing-sessions/${session.id}/seal`)!, {
          method: "POST",
          body: { file_ids: [uploadedFile.id] },
          version: session.version,
        });
        toast.success("فایل فروش به سرور ارسال و در پایگاه داده ثبت شد.");
      } catch {
        // Rows remain displayed even if server intake is restricted
      }
    }
  };

  const handleImportPurchases = async (parsed: ParsedTableImport) => {
    const rows = parseMoadianExcel(parsed);
    if (!rows.length) {
      toast.error("ردیف معتبری در فایل اکسل یافت نشد.");
      return;
    }
    setImportedPurchases(rows);
    if (companyId) {
      try {
        localStorage.setItem(`didban-moadian-purchases:${companyId}`, JSON.stringify(rows));
      } catch {
        // Ignore storage errors
      }
    }
    toast.success(`${persian(rows.length)} صورتحساب خرید مؤدیان با موفقیت وارد جدول شد.`);

    if (parsed.file && companyId) {
      try {
        const session = await api<ProcessingSession>(
          workspace.companyPath("processing-sessions")!,
          { method: "POST", body: { period_id: workspace.periodId || null } },
        );
        const body = new FormData();
        body.append("file", parsed.file);
        const uploadedFile = await api<SourceFile>(
          workspace.companyPath(`processing-sessions/${session.id}/files`)!,
          { method: "POST", body },
        );
        await api(workspace.companyPath(`processing-sessions/${session.id}/seal`)!, {
          method: "POST",
          body: { file_ids: [uploadedFile.id] },
          version: session.version,
        });
        toast.success("فایل خرید به سرور ارسال و در پایگاه داده ثبت شد.");
      } catch {
        // Rows remain displayed even if server intake is restricted
      }
    }
  };

  const currentRows = activeTab === "sales" ? displaySales : displayPurchases;
  const currentTitle = activeTab === "sales" ? "صورتحساب‌های فروش مؤدیان" : "صورتحساب‌های خرید مؤدیان";
  const currentHandler = activeTab === "sales" ? handleImportSales : handleImportPurchases;
  const emptyTitle =
    activeTab === "sales"
      ? "هنوز صورتحساب فروشی برای مؤدیان ثبت نشده است"
      : "هنوز صورتحساب خریدی برای مؤدیان ثبت نشده است";

  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="مؤدیان"
      />

      {view.loading ? (
        <LoadingState label="در حال دریافت اطلاعات کارپوشه مؤدیان..." />
      ) : view.error ? (
        <ErrorState message={view.error.message} onRetry={view.refresh} />
      ) : (
        <div className="space-y-5">
          <Panel>
            <div className="mb-4">
              <Tabs
                value={activeTab}
                onChange={setActiveTab}
                items={[
                  {
                    id: "sales",
                    label: `فروش کارپوشه (${persian(displaySales.length)})`,
                    icon: ArrowUpRightIcon,
                  },
                  {
                    id: "purchases",
                    label: `خرید کارپوشه (${persian(displayPurchases.length)})`,
                    icon: ArrowDownLeftIcon,
                  },
                ]}
              />
            </div>

            <Table
              title={currentTitle}
              onImport={currentHandler}
            >
              <TableHeader>
                <TableRow>
                  <TableHead>شماره صورتحساب</TableHead>
                  <TableHead>شناسه یکتای مالیاتی (Tax ID)</TableHead>
                  <TableHead>تاریخ صدور</TableHead>
                  <TableHead>{activeTab === "sales" ? "خریدار" : "فروشنده"}</TableHead>
                  <TableHead>مجموع صورتحساب ({unit === "IRR" ? "ریال" : "تومان"})</TableHead>
                  <TableHead>ارزش افزوده ({unit === "IRR" ? "ریال" : "تومان"})</TableHead>
                  <TableHead>وضعیت کارپوشه</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentRows.length ? (
                  currentRows.map((row, index) => (
                    <TableRow key={row.tax_id || row.reference || index}>
                      <TableRowHeader>
                        <span className="font-medium text-foreground">{row.reference}</span>
                      </TableRowHeader>
                      <TableCell>
                        <span dir="ltr" className="font-mono text-xs text-muted break-all">
                          {row.tax_id || "—"}
                        </span>
                      </TableCell>
                      <TableCell>{row.date ? displayDate(row.date) : "—"}</TableCell>
                      <TableCell>
                        <span className="truncate max-w-[180px] block" title={row.party}>
                          {row.party || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold text-foreground">
                        {amount(row.amount, unit)}
                      </TableCell>
                      <TableCell className="text-muted">
                        {amount(row.vat_amount, unit)}
                      </TableCell>
                      <TableCell>
                        <Badge tone={statusToneMap[row.status] || "neutral"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell
                    colSpan={7}
                    title={emptyTitle}
                  />
                )}
              </TableBody>
            </Table>
          </Panel>
        </div>
      )}
    </>
  );
}
