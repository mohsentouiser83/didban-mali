"use client";

import { useMemo, useState } from "react";
import { BooksIcon, DownloadSimpleIcon, FileTextIcon } from "@phosphor-icons/react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
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
  TableRowHeader,
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
  description: string;
  party_id: string;
  debit: string;
  credit: string;
  balance: string;
  balance_nature: string;
}

interface LedgerAccountGroup {
  account: {
    account_id: string;
    code: string;
    name: string;
    nature: string;
    level: string;
    parent_code?: string;
    parent_name?: string;
  };
  total_debit: string;
  total_credit: string;
  final_balance: string;
  final_nature: string;
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
  total_debit: string;
  total_credit: string;
  items: LedgerAccountGroup[];
}

export function ElectronicLedgersView() {
  const workspace = useWorkspace();
  const [level, setLevel] = useState<"general" | "subsidiary">("general");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [includeTurnover, setIncludeTurnover] = useState(true);
  const [autoDailyNumbering, setAutoDailyNumbering] = useState(true);

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

  const exportExcel = () => {
    if (!data?.items?.length) return;
    const rows: Record<string, string | number>[] = [];

    data.items.forEach((group) => {
      if (group.entries && group.entries.length) {
        group.entries.forEach((entry) => {
          rows.push({
            "کد حساب": group.account.code,
            "نام حساب": group.account.name,
            "سطح حساب": level === "general" ? "کل" : "معین",
            "تاریخ": displayDate(entry.date),
            "شماره سند روزانه": entry.daily_doc_no,
            "شماره سند سیستم": entry.journal_sequence,
            "شرح": entry.description,
            "طرف حساب": entry.party_id || "—",
            "بدهکار (ریال)": Number(entry.debit),
            "بستانکار (ریال)": Number(entry.credit),
            "مانده (ریال)": Number(entry.balance),
            "تشخیص": entry.balance_nature,
          });
        });
      } else {
        rows.push({
          "کد حساب": group.account.code,
          "نام حساب": group.account.name,
          "سطح حساب": level === "general" ? "کل" : "معین",
          "گردش بدهکار (ریال)": Number(group.total_debit),
          "گردش بستانکار (ریال)": Number(group.total_credit),
          "مانده پایان دوره (ریال)": Number(group.final_balance),
          "تشخیص": group.final_nature,
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, level === "general" ? "دفتر کل" : "دفتر معین");
    XLSX.writeFile(workbook, `electronic-ledger-${level}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (!workspace.company) return <NoCompany />;

  return (
    <>
      <PageHeader
        title="دفاتر قانونی الکترونیک"
        icon={BooksIcon}
        action={
          <Button
            variant="secondary"
            onClick={exportExcel}
            disabled={!data?.items?.length}
            className="gap-1.5"
          >
            <DownloadSimpleIcon size={16} aria-hidden />
            خروجی اکسل دفاتر
          </Button>
        }
      />

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

      {/* KPI Cards */}
      {data && (
        <div className="my-5 grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <span className="text-xs text-muted">روزهای دارای سند</span>
            <div className="mt-2 text-xl font-medium tabular-nums text-foreground">
              {persian(data.dates_count)} <span className="text-xs text-muted">روز</span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <span className="text-xs text-muted">کل اسناد دوره</span>
            <div className="mt-2 text-xl font-medium tabular-nums text-foreground">
              {persian(data.total_journals)} <span className="text-xs text-muted">سند</span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <span className="text-xs text-muted">جمع بدهکار دوره</span>
            <div className="mt-2 text-xl font-medium tabular-nums text-foreground">
              {amount(data.total_debit)} <span className="text-xs text-muted">ریال</span>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
            <span className="text-xs text-muted">جمع بستانکار دوره</span>
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
                <div className="flex flex-wrap items-center justify-between bg-canvas/70 px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Badge tone="primary">{group.account.code}</Badge>
                    <span className="font-medium text-foreground">{group.account.name}</span>
                    {group.account.parent_name && (
                      <span className="text-xs text-muted">
                        (کل: {group.account.parent_code} - {group.account.parent_name})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span>جمع بدهکار: <b>{amount(group.total_debit)}</b></span>
                    <span>جمع بستانکار: <b>{amount(group.total_credit)}</b></span>
                    <span>مانده: <b>{amount(group.final_balance)}</b> ({group.final_nature})</span>
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
                          <TableCell><bdi>{entry.journal_sequence}</bdi></TableCell>
                          <TableCell className="max-w-xs truncate">{entry.description}</TableCell>
                          {level === "subsidiary" && <TableCell>{entry.party_id || "—"}</TableCell>}
                          <TableCell numeric className="tabular-nums">{amount(entry.debit)}</TableCell>
                          <TableCell numeric className="tabular-nums">{amount(entry.credit)}</TableCell>
                          <TableCell numeric className="tabular-nums font-medium">{amount(entry.balance)}</TableCell>
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
                    گردش ردیفی غیرفعال است. مانده پایان دوره: {amount(group.final_balance)} ریال ({group.final_nature})
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
