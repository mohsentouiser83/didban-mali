"use client";

import { useState } from "react";
import { BooksIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Field } from "@/components/ui/field";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import { amount, displayDate, persian } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";

interface LedgerEntry {
  journal_id: string;
  date: string;
  daily_doc_no: number;
  journal_sequence: number;
  journal_number?: string | null;
  is_reversal?: boolean;
  reversal_of?: string | null;
  account_code?: string;
  account_name?: string;
  description: string;
  party_id: string;
  debit: string | null;
  credit: string | null;
  balance: string | null;
  balance_nature: string;
  amount_unknown?: boolean;
}

interface LedgerAccountGroup {
  account: {
    account_id: string;
    code: string;
    name: string;
    nature: string;
    level: string;
    parent_code?: string | null;
    parent_name?: string | null;
    mapping_status?: string;
  };
  opening_debit?: string | null;
  opening_credit?: string | null;
  opening_balance?: string | null;
  opening_nature?: string;
  total_debit: string;
  total_credit: string;
  final_balance: string | null;
  final_nature: string;
  has_unknown_amounts?: boolean;
  entries?: LedgerEntry[];
}

interface ElectronicLedgerData {
  level: "general" | "subsidiary";
  from_date: string | null;
  to_date: string | null;
  include_turnover: boolean;
  auto_daily_numbering: boolean;
  dates_count: number;
  total_journals: number;
  opening_total_debit?: string;
  opening_total_credit?: string;
  total_debit: string;
  total_credit: string;
  unmapped_accounts_count?: number;
  unknown_amount_lines_count?: number;
  items: LedgerAccountGroup[];
}

export function ElectronicLedgersView() {
  const workspace = useWorkspace();
  const [level, setLevel] = useState<"general" | "subsidiary">("general");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [includeTurnover, setIncludeTurnover] = useState(true);
  const [autoDailyNumbering, setAutoDailyNumbering] = useState(true);
  const [downloadingMode, setDownloadingMode] = useState<"management" | "upload_draft" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const queryParams = new URLSearchParams();
  queryParams.set("level", level);
  if (fromDate) queryParams.set("from_date", fromDate);
  if (toDate) queryParams.set("to_date", toDate);
  queryParams.set("include_turnover", String(includeTurnover));
  queryParams.set("auto_daily_numbering", String(autoDailyNumbering));

  const resource = useResource<ElectronicLedgerData>(
    workspace.companyPath(`accounting/electronic-ledgers?${queryParams.toString()}`),
  );

  const data = resource.data;

  const downloadExcel = async (exportMode: "management" | "upload_draft") => {
    if (!workspace.company || !data?.items?.length) return;
    setExportError(null);
    setDownloadingMode(exportMode);
    try {
      const exportParams = new URLSearchParams(queryParams);
      exportParams.set("export_mode", exportMode);
      const url = `/api/v1${workspace.companyPath(`accounting/electronic-ledgers/export?${exportParams.toString()}`)}`;
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        throw new Error("خروجی اکسل دفاتر آماده نشد.");
      }
      const blob = await response.blob();
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = `electronic-ledger-${exportMode}-${level}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "خطا در دریافت خروجی اکسل.");
    } finally {
      setDownloadingMode(null);
    }
  };

  if (!workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        title="دفاتر قانونی الکترونیک"
        icon={BooksIcon}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => downloadExcel("management")}
              disabled={!data?.items?.length || downloadingMode !== null}
              busy={downloadingMode === "management"}
              className="gap-1.5"
            >
              <DownloadSimpleIcon size={16} aria-hidden />
              خروجی اکسل مدیریتی
            </Button>
            <Button
              variant="secondary"
              onClick={() => downloadExcel("upload_draft")}
              disabled={!data?.items?.length || downloadingMode !== null}
              busy={downloadingMode === "upload_draft"}
              className="gap-1.5"
            >
              <DownloadSimpleIcon size={16} aria-hidden />
              پیش‌نویس بارگذاری دفاتر
            </Button>
          </div>
        }
      />

      {exportError && <StatusMessage tone="danger">{exportError}</StatusMessage>}

      {data && ((data.unmapped_accounts_count ?? 0) > 0 || (data.unknown_amount_lines_count ?? 0) > 0) && (
        <StatusMessage tone="warning">
          {data.unmapped_accounts_count ? `${persian(data.unmapped_accounts_count)} حساب بدون نگاشت کامل کل/معین دارد. ` : ""}
          {data.unknown_amount_lines_count ? `${persian(data.unknown_amount_lines_count)} ردیف دارای مبلغ نامعلوم است.` : ""}
        </StatusMessage>
      )}

      <Panel title="پارامترها و تنظیمات دفتر">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 items-end">
          <Field id="ledger-level" label="سطح دفتر">
            <Select
              id="ledger-level"
              value={level}
              onValueChange={(val) => setLevel(val as "general" | "subsidiary")}
              options={[
                { value: "general", label: "دفتر کل (سطح کل)" },
                { value: "subsidiary", label: "دفتر معین (سطح معین)" },
              ]}
            />
          </Field>

          <Field id="ledger-from-date" label="از تاریخ">
            <PersianDatePicker
              id="ledger-from-date"
              value={fromDate}
              onChange={setFromDate}
            />
          </Field>

          <Field id="ledger-to-date" label="تا تاریخ">
            <PersianDatePicker
              id="ledger-to-date"
              value={toDate}
              onChange={setToDate}
            />
          </Field>

          <div className="space-y-3 pb-1">
            <Checkbox
              id="ledger-auto-numbering"
              checked={autoDailyNumbering}
              onCheckedChange={(checked) => setAutoDailyNumbering(Boolean(checked))}
              label="شماره‌گذاری روزانه اتوماتیک اسناد (هر تاریخ یک شماره ترتیبی)"
            />
            {level === "subsidiary" && (
              <Checkbox
                id="ledger-include-turnover"
                checked={includeTurnover}
                onCheckedChange={(checked) => setIncludeTurnover(Boolean(checked))}
                label="نمایش ریز گردش معین"
              />
            )}
          </div>
        </div>
      </Panel>

      {data && (
        <div className="my-5 grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <span className="text-xs text-muted">روزهای دارای سند</span>
            <div className="mt-2 text-xl font-medium tabular-nums text-foreground">
              {persian(data.dates_count)} <span className="text-xs text-muted">روز</span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <span className="text-xs text-muted">کل اسناد بازه</span>
            <div className="mt-2 text-xl font-medium tabular-nums text-foreground">
              {persian(data.total_journals)} <span className="text-xs text-muted">سند</span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <span className="text-xs text-muted">گردش بدهکار بازه</span>
            <div className="mt-2 text-xl font-medium tabular-nums text-foreground">
              {amount(data.total_debit)} <span className="text-xs text-muted">ریال</span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <span className="text-xs text-muted">گردش بستانکار بازه</span>
            <div className="mt-2 text-xl font-medium tabular-nums text-foreground">
              {amount(data.total_credit)} <span className="text-xs text-muted">ریال</span>
            </div>
          </div>
        </div>
      )}

      <Panel title={level === "general" ? "دفتر کل قانونی" : "دفتر معین قانونی"}>
        {resource.loading ? (
          <LoadingState label="در حال محاسبه و آماده‌سازی دفاتر الکترونیک..." />
        ) : resource.error ? (
          <ErrorState message={resource.error.message} onRetry={resource.refresh} />
        ) : !data?.items?.length ? (
          <TableEmptyCell colSpan={8} title="سندی در بازهٔ انتخابی برای نمایش در دفاتر وجود ندارد" />
        ) : (
          <div className="space-y-6">
            {data.items.map((group) => (
              <div key={group.account.account_id} className="rounded-xl border border-border overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-canvas/70 px-4 py-3 border-b border-border">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="primary">{group.account.code}</Badge>
                    <span className="font-medium text-foreground">{group.account.name}</span>
                    {group.account.parent_name && (
                      <span className="text-xs text-muted">
                        (کل: {group.account.parent_code} - {group.account.parent_name})
                      </span>
                    )}
                    {group.account.mapping_status && group.account.mapping_status !== "mapped" && (
                      <Badge tone="warning">نگاشت ناقص</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    {data.from_date && (
                      <span>
                        مانده ابتدای بازه:{" "}
                        <b>{group.opening_balance !== null && group.opening_balance !== undefined ? amount(group.opening_balance) : "نامعلوم"}</b>{" "}
                        ({group.opening_nature || "—"})
                      </span>
                    )}
                    <span>گردش بدهکار: <b>{amount(group.total_debit)}</b></span>
                    <span>گردش بستانکار: <b>{amount(group.total_credit)}</b></span>
                    <span>
                      مانده پایان بازه:{" "}
                      <b>{group.final_balance !== null ? amount(group.final_balance) : "نامعلوم"}</b>{" "}
                      ({group.final_nature})
                    </span>
                  </div>
                </div>

                {group.entries && group.entries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>تاریخ</TableHead>
                        <TableHead>شماره روزانه</TableHead>
                        <TableHead>شماره سند</TableHead>
                        <TableHead>شرح سند و ردیف</TableHead>
                        {level === "subsidiary" && <TableHead>طرف حساب</TableHead>}
                        <TableHead numeric>بدهکار (ریال)</TableHead>
                        <TableHead numeric>بستانکار (ریال)</TableHead>
                        <TableHead numeric>مانده (ریال)</TableHead>
                        <TableHead>تشخیص</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.entries.map((entry, idx) => (
                        <TableRow key={`${entry.journal_id}-${idx}`}>
                          <TableCell className="whitespace-nowrap">{displayDate(entry.date)}</TableCell>
                          <TableCell className="font-semibold text-primary">
                            <span dir="ltr">#{entry.daily_doc_no}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <bdi>{entry.journal_sequence}</bdi>
                              {entry.is_reversal && <Badge tone="warning">برگشت</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{entry.description}</TableCell>
                          {level === "subsidiary" && <TableCell>{entry.party_id || "—"}</TableCell>}
                          <TableCell numeric className="tabular-nums">
                            {entry.debit !== null ? amount(entry.debit) : "نامعلوم"}
                          </TableCell>
                          <TableCell numeric className="tabular-nums">
                            {entry.credit !== null ? amount(entry.credit) : "نامعلوم"}
                          </TableCell>
                          <TableCell numeric className="tabular-nums font-medium">
                            {entry.balance !== null ? amount(entry.balance) : "نامعلوم"}
                          </TableCell>
                          <TableCell>
                            <Badge tone={entry.balance_nature === "بدهکار" ? "success" : entry.balance_nature === "بستانکار" ? "warning" : "neutral"}>
                              {entry.balance_nature}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="p-3 text-center text-xs text-muted">
                    {group.entries ? "گردشی در این بازه ثبت نشده است." : "گردش ردیفی غیرفعال است."} مانده پایان بازه:{" "}
                    {group.final_balance !== null ? `${amount(group.final_balance)} ریال` : "نامعلوم"} ({group.final_nature})
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
