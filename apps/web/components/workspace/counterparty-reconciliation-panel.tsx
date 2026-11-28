"use client";

import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { useState } from "react";
import {
  ArrowsLeftRightIcon,
  CheckCircleIcon,
  WarningCircleIcon,
  FileTextIcon,
  CalendarBlankIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useCounterpartyReconciliation } from "@/hooks/use-counterparty-reconciliation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Input, Textarea } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Drawer } from "@/components/ui/drawer";
import { StatusBadge } from "@/components/ui/badge";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  StatusMessage,
} from "@/components/ui/content-states";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Panel } from "./page-parts";
import { amount, displayDate, persian, asciiDigits } from "@/lib/utils";
import { toast } from "sonner";
import type { ParsedTableImport } from "@/components/ui/table-import-dialog";
import type { StatementRow } from "@/hooks/use-counterparty-reconciliation";

export function CounterpartyReconciliationPanel({ initialPartyId }: { initialPartyId?: string } = {}) {
  const recon = useCounterpartyReconciliation(initialPartyId);
  const [statementDrawerOpen, setStatementDrawerOpen] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [decisionStatus, setDecisionStatus] = useState<"reviewed" | "disputed" | "completed">("reviewed");
  const [reconTab, setReconTab] = useState<"open_book" | "open_statement" | "discrepancies" | "matched">("open_book");
  const [newRow, setNewRow] = useState({
    date: recon.asOfDate,
    reference: "",
    debit: "0",
    credit: "0",
    description: "",
  });

  const unit = recon.workspace.unit;
  const selectedCandidate = recon.candidates.data?.items.find(
    (c) => c.id === recon.selectedPartyId,
  );

  const handleImportStatementExcel = (parsed: ParsedTableImport) => {
    if (!parsed.rows.length) return;
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

    const dateIdx = getCol(["تاریخ", "date"]);
    const refIdx = getCol(["شماره", "مدرک", "سند", "فاکتور", "reference", "ref"]);
    const debitIdx = getCol(["بدهکار", "debit"]);
    const creditIdx = getCol(["بستانکار", "credit"]);
    const amountIdx = getCol(["مبلغ", "amount"]);
    const descIdx = getCol(["شرح", "توضیحات", "description", "desc"]);

    const rows: StatementRow[] = [];
    for (const r of parsed.rows) {
      const rawDate = dateIdx >= 0 ? asciiDigits(String(r[dateIdx] ?? "").trim()) : recon.asOfDate;
      const ref = refIdx >= 0 ? String(r[refIdx] ?? "").trim() : "";
      let deb = debitIdx >= 0 ? asciiDigits(String(r[debitIdx] ?? "").replace(/[,٬\s]/g, "")) : "0";
      let cred = creditIdx >= 0 ? asciiDigits(String(r[creditIdx] ?? "").replace(/[,٬\s]/g, "")) : "0";
      if (debitIdx < 0 && creditIdx < 0 && amountIdx >= 0) {
        const amt = asciiDigits(String(r[amountIdx] ?? "").replace(/[,٬\s]/g, ""));
        if (Number(amt) > 0) deb = amt;
        else if (Number(amt) < 0) cred = String(Math.abs(Number(amt)));
      }
      const desc = descIdx >= 0 ? String(r[descIdx] ?? "").trim() : "";
      if (rawDate && (deb !== "0" || cred !== "0" || ref)) {
        rows.push({
          date: rawDate,
          reference: ref,
          debit: deb,
          credit: cred,
          description: desc,
        });
      }
    }

    if (rows.length > 0) {
      recon.setStatementRows((prev) => [...prev, ...rows]);
      recon.setStatementSource("excel");
      toast.success(`${persian(rows.length)} ردیف صورت‌حساب با موفقیت وارد شد.`);
    } else {
      toast.error("ردیف معتبری در فایل یافت نشد.");
    }
  };

  const sourceLabels = {
    none: "صورت‌حساب طرف‌حساب وارد نشده",
    manual: "ورود دستی ردیف‌ها",
    paste: "چسباندن جدول (Paste)",
    excel: "فایل اکسل صورت‌حساب",
  } as const;

  const hasCandidates = (recon.candidates.data?.items.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <Panel title="انتخاب طرف‌حساب و پارامترهای تطبیق">
        <div className="grid gap-4 md:grid-cols-3">
          <Field id="recon-party-select" label="طرف‌حساب (مشتری / تأمین‌کننده)" required>
            <Select
              id="recon-party-select"
              value={recon.selectedPartyId}
              onValueChange={(val) => {
                recon.setSelectedPartyId(val);
                recon.setActiveRun(null);
              }}
              options={[
                { value: "", label: "انتخاب طرف‌حساب..." },
                ...(recon.candidates.data?.items.map((item) => ({
                  value: item.id,
                  label: `${item.name} (${item.code}) — مانده: ${amount(item.current_balance, unit)} ${
                    item.direction === "debtor"
                      ? "بدهکار"
                      : item.direction === "creditor"
                      ? "بستانکار"
                      : "تسویه"
                  }`,
                })) || []),
              ]}
            />
          </Field>

          <Field id="recon-as-of-date" label="تا تاریخ (مبنای صورت‌حساب)" icon={CalendarBlankIcon} required>
            <PersianDatePicker
              id="recon-as-of-date"
              value={recon.asOfDate}
              onChange={(val) => recon.setAsOfDate(val)}
              label="تا تاریخ (مبنای صورت‌حساب)"
            />
          </Field>

          <Field id="recon-tolerance" label="تلورانس تاریخ (روز)">
            <Input
              id="recon-tolerance"
              type="number"
              min={0}
              max={60}
              value={recon.toleranceDays}
              onChange={(e) => recon.setToleranceDays(Number(e.target.value) || 0)}
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/80 bg-canvas/50 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              منبع صورت‌حساب: <b>{sourceLabels[recon.statementSource]}</b> ({persian(recon.statementRows.length)} ردیف)
            </span>
            <span>
              تاریخ برش: <b>{displayDate(recon.asOfDate)}</b>
            </span>
            <span>
              تلورانس تاریخ: <b>{persian(recon.toleranceDays)} روز</b>
            </span>
          </div>
          {!hasCandidates && !recon.candidates.loading && (
            <ButtonLink variant="secondary" className="min-h-8 px-3 text-xs" href="/commercial/counterparties">
              تعریف طرف‌حساب
            </ButtonLink>
          )}
        </div>

        {selectedCandidate && (
          <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-border/80 bg-surface-subtle p-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-muted">مانده دفاتر دیدبان</p>
              <p className="mt-1 font-medium text-base">
                {amount(selectedCandidate.current_balance, unit)} {unit === "IRR" ? "ریال" : "تومان"}
              </p>
              <p className="text-xs text-muted">
                {selectedCandidate.direction === "debtor"
                  ? "بدهکار به ما"
                  : selectedCandidate.direction === "creditor"
                  ? "بستانکار از ما"
                  : "تسویه کامل"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">گردش بدهکار</p>
              <p className="mt-1 font-medium text-base">{amount(selectedCandidate.debit_total, unit)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">گردش بستانکار</p>
              <p className="mt-1 font-medium text-base">{amount(selectedCandidate.credit_total, unit)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">تعداد اسناد و آرتیکل‌ها</p>
              <p className="mt-1 font-medium text-base">{persian(selectedCandidate.transaction_count)} سند</p>
            </div>
          </div>
        )}
      </Panel>

      {recon.selectedPartyId ? (
        <>
          <Panel
            title="صورت مغایرت و تطبیق هوشمند"
            action={
              recon.workspace.canWrite && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setStatementDrawerOpen(true)}
                  >
                    <FileTextIcon size={18} />
                    ورود صورت‌حساب طرف‌حساب ({persian(recon.statementRows.length)} ردیف)
                  </Button>
                  <Button
                    busy={recon.reconcileCommand.busy}
                    disabled={recon.statementRows.length === 0}
                    onClick={() => void recon.executeReconcile()}
                  >
                    <ArrowsLeftRightIcon size={18} />
                    اجرای تطبیق
                  </Button>
                </div>
              )
            }
          >
            {recon.reconcileCommand.error && (
              <FormMessage error>{recon.reconcileCommand.error.message}</FormMessage>
            )}

            {recon.activeRun ? (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="rounded-xl border border-border/80 bg-surface-subtle p-4">
                    <p className="text-xs text-muted">مانده طبق دفاتر ما</p>
                    <p className="mt-1 font-semibold text-lg">
                      {amount(recon.activeRun.payload.summary.book_balance, unit)}
                    </p>
                    <p className="text-xs text-muted">
                      {recon.activeRun.payload.summary.book_direction === "debtor" ? "بدهکار" : "بستانکار"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-surface-subtle p-4">
                    <p className="text-xs text-muted">مانده صورت‌حساب طرف‌حساب</p>
                    <p className="mt-1 font-semibold text-lg">
                      {amount(recon.activeRun.payload.summary.statement_balance, unit)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-surface-subtle p-4">
                    <p className="text-xs text-muted">مغایرت خالص نهایی</p>
                    <p className={`mt-1 font-semibold text-lg ${recon.activeRun.discrepancy === "0" ? "text-emerald-600" : "text-amber-600"}`}>
                      {amount(recon.activeRun.discrepancy, unit)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-surface-subtle p-4">
                    <p className="text-xs text-muted">وضعیت تطبیق</p>
                    <div className="mt-1">
                      <StatusBadge
                        status={
                          recon.activeRun.payload.summary.is_fully_reconciled
                            ? "accepted"
                            : recon.activeRun.payload.summary.discrepancy_count > 0
                            ? "rejected"
                            : "needs_review"
                        }
                      />
                    </div>
                  </div>
                </div>

                {recon.activeRun.payload.summary.is_fully_reconciled ? (
                  <StatusMessage tone="primary">
                    <CheckCircleIcon size={20} className="text-emerald-600" />
                    تمامی اقلام طرفین کاملاً تطبیق یافتند و هیچ قلم بازی وجود ندارد.
                  </StatusMessage>
                ) : (
                  <StatusMessage tone="warning">
                    <WarningCircleIcon size={20} className="text-amber-600" />
                    {persian(recon.activeRun.open_book_count)} قلم باز در دفاتر ما،{" "}
                    {persian(recon.activeRun.open_statement_count)} قلم باز در صورت‌حساب طرف مقابل و{" "}
                    {persian(recon.activeRun.payload.summary.discrepancy_count)} اختلاف مبلغ شناسایی شد.
                  </StatusMessage>
                )}

                <div className="mb-4">
                  <Tabs
                    value={reconTab}
                    onChange={setReconTab}
                    items={[
                      {
                        id: "open_book",
                        label: "اقلام باز دفاتر ما",
                        badge: (
                          <span className="ms-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                            {persian(recon.activeRun.payload.open_in_book.length)}
                          </span>
                        ),
                      },
                      {
                        id: "open_statement",
                        label: "اقلام باز طرف مقابل",
                        badge: (
                          <span className="ms-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                            {persian(recon.activeRun.payload.open_in_statement.length)}
                          </span>
                        ),
                      },
                      {
                        id: "discrepancies",
                        label: "اختلاف مبالغ",
                        badge: (
                          <span className="ms-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600">
                            {persian(recon.activeRun.payload.discrepancy_items.length)}
                          </span>
                        ),
                      },
                      {
                        id: "matched",
                        label: "اقلام منطبق‌شده",
                        badge: (
                          <span className="ms-1.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600">
                            {persian(recon.activeRun.payload.matched_items.length)}
                          </span>
                        ),
                      },
                    ]}
                  />
                </div>

                {reconTab === "open_book" && (
                  <div>
                    <h4 className="mb-2 font-medium text-sm">اقلام باز دفاتر ما (ثبت‌شده نزد ما، منظورنشده توسط طرف‌حساب)</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>شماره سند / مدرک</TableHead>
                          <TableHead>تاریخ</TableHead>
                          <TableHead>شرح</TableHead>
                          <TableHead>بدهکار</TableHead>
                          <TableHead>بستانکار</TableHead>
                          <TableHead>ماهیت قلم باز</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recon.activeRun.payload.open_in_book.length ? (
                          recon.activeRun.payload.open_in_book.map((item) => (
                            <TableRow key={item.id}>
                              <TableRowHeader>{item.reference || "—"}</TableRowHeader>
                              <TableCell>{displayDate(item.date)}</TableCell>
                              <TableCell>{item.description}</TableCell>
                              <TableCell>{amount(item.debit, unit)}</TableCell>
                              <TableCell>{amount(item.credit, unit)}</TableCell>
                              <TableCell className="text-xs text-muted">{item.nature}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableEmptyCell colSpan={6} title="هیچ قلم بازی در دفاتر ما وجود ندارد" />
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {reconTab === "open_statement" && (
                  <div>
                    <h4 className="mb-2 font-medium text-sm">اقلام باز صورت‌حساب طرف‌حساب (اعلامی طرف مقابل، ثبت‌نشده در دفاتر ما)</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>شماره مدرک</TableHead>
                          <TableHead>تاریخ</TableHead>
                          <TableHead>شرح طرف‌حساب</TableHead>
                          <TableHead>بدهکار طرف</TableHead>
                          <TableHead>بستانکار طرف</TableHead>
                          <TableHead>ماهیت قلم باز</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recon.activeRun.payload.open_in_statement.length ? (
                          recon.activeRun.payload.open_in_statement.map((item) => (
                            <TableRow key={item.id}>
                              <TableRowHeader>{item.reference || "—"}</TableRowHeader>
                              <TableCell>{displayDate(item.date)}</TableCell>
                              <TableCell>{item.description}</TableCell>
                              <TableCell>{amount(item.debit, unit)}</TableCell>
                              <TableCell>{amount(item.credit, unit)}</TableCell>
                              <TableCell className="text-xs text-muted">{item.nature}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableEmptyCell colSpan={6} title="هیچ قلم بازی در صورت‌حساب طرف‌حساب وجود ندارد" />
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {reconTab === "discrepancies" && (
                  <div>
                    <h4 className="mb-2 font-medium text-sm text-amber-700">اختلاف مبالغ در اسناد با شماره یکسان</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>شماره مدرک</TableHead>
                          <TableHead>تاریخ ما</TableHead>
                          <TableHead>مبلغ در دفاتر ما</TableHead>
                          <TableHead>مبلغ در صورت‌حساب طرف</TableHead>
                          <TableHead>میزان اختلاف</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recon.activeRun.payload.discrepancy_items.length ? (
                          recon.activeRun.payload.discrepancy_items.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableRowHeader>{item.book_item.reference || "—"}</TableRowHeader>
                              <TableCell>{displayDate(item.book_item.date)}</TableCell>
                              <TableCell>{amount(item.book_item.debit !== "0" ? item.book_item.debit : item.book_item.credit, unit)}</TableCell>
                              <TableCell>{amount(item.statement_item.credit !== "0" ? item.statement_item.credit : item.statement_item.debit, unit)}</TableCell>
                              <TableCell className="font-semibold text-rose-600">{amount(item.difference, unit)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableEmptyCell colSpan={5} title="هیچ اختلاف مبلغی در شماره مدارک یکسان وجود ندارد" />
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {reconTab === "matched" && (
                  <div>
                    <h4 className="mb-2 font-medium text-sm text-emerald-700">اقلام منطبق‌شده ({persian(recon.activeRun.payload.matched_items.length)} ردیف)</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>شماره مدرک</TableHead>
                          <TableHead>تاریخ دفاتر ما</TableHead>
                          <TableHead>تاریخ صورت‌حساب</TableHead>
                          <TableHead>مبلغ تطبیق‌یافته</TableHead>
                          <TableHead>نوع انطباق</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recon.activeRun.payload.matched_items.length ? (
                          recon.activeRun.payload.matched_items.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableRowHeader>{item.book_item.reference || item.statement_item.reference || "—"}</TableRowHeader>
                              <TableCell>{displayDate(item.book_item.date)}</TableCell>
                              <TableCell>{displayDate(item.statement_item.date)}</TableCell>
                              <TableCell className="font-semibold">{amount(item.matched_amount, unit)}</TableCell>
                              <TableCell className="text-xs text-emerald-700">{item.label}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableEmptyCell colSpan={5} title="موردی تطبیق داده نشده است" />
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {recon.workspace.canWrite && (
                  <div className="rounded-xl border border-border p-4">
                    <h4 className="mb-2 font-medium text-sm">ثبت تصمیم و نتیجه رسیدگی مغایرت</h4>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field id="recon-decision-status" label="وضعیت نتیجه" required>
                        <Select
                          id="recon-decision-status"
                          value={decisionStatus}
                          onValueChange={(val) =>
                            setDecisionStatus(
                              val as "reviewed" | "disputed" | "completed",
                            )
                          }
                          options={[
                            { value: "reviewed", label: "بررسی و ارسال تاییدیه" },
                            { value: "disputed", label: "دارای اختلاف معلق" },
                            { value: "completed", label: "تطبیق نهایی" },
                          ]}
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field id="recon-decision-notes" label="توضیحات و شرح توافق / اختلاف">
                          <Input
                            id="recon-decision-notes"
                            value={decisionNotes}
                            onChange={(e) => setDecisionNotes(e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button
                        busy={recon.decideCommand.busy}
                        onClick={() => void recon.decideRun(recon.activeRun!.id, decisionStatus, decisionNotes)}
                      >
                        ثبت نتیجه رسیدگی
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                title="هنوز تطبیقی برای این طرف‌حساب انجام نشده است"
                action={
                  <Button variant="secondary" onClick={() => setStatementDrawerOpen(true)}>
                    ورود ردیف‌های صورت‌حساب
                  </Button>
                }
              />
            )}
          </Panel>

          <Panel title={`گردش معین در دفاتر دیدبان (${selectedCandidate?.name || ""})`}>
            {recon.ledger.loading ? (
              <LoadingState />
            ) : recon.ledger.error ? (
              <ErrorState message={recon.ledger.error.message} onRetry={recon.ledger.refresh} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>شماره سند / پیگیری</TableHead>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>شرح</TableHead>
                    <TableHead>بدهکار ({unit === "IRR" ? "ریال" : "تومان"})</TableHead>
                    <TableHead>بستانکار ({unit === "IRR" ? "ریال" : "تومان"})</TableHead>
                    <TableHead>مانده پس از سند</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recon.ledger.data?.entries.length ? (
                    recon.ledger.data.entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableRowHeader>{entry.reference || (entry.journal_sequence ? `سند ${entry.journal_sequence}` : "—")}</TableRowHeader>
                        <TableCell>{displayDate(entry.date)}</TableCell>
                        <TableCell>{entry.description}</TableCell>
                        <TableCell>{amount(entry.debit, unit)}</TableCell>
                        <TableCell>{amount(entry.credit, unit)}</TableCell>
                        <TableCell className="font-semibold">{amount(entry.running_balance, unit)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell colSpan={6} title="هیچ گردشی برای این طرف‌حساب در دفاتر ثبت نشده است" />
                  )}
                </TableBody>
              </Table>
            )}
          </Panel>

          {recon.history.data?.items && recon.history.data.items.length > 0 && (
            <Panel title="سوابق تطبیق‌های ثبت‌شده">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>تاریخ مبنا</TableHead>
                    <TableHead>مانده دفاتر</TableHead>
                    <TableHead>مانده صورت‌حساب</TableHead>
                    <TableHead>میزان مغایرت</TableHead>
                    <TableHead>اقلام منطبق</TableHead>
                    <TableHead>اقلام باز</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>یادداشت</TableHead>
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recon.history.data.items.map((run) => (
                    <TableRow key={run.id}>
                      <TableRowHeader>{displayDate(run.as_of_date)}</TableRowHeader>
                      <TableCell>{amount(run.book_balance, unit)}</TableCell>
                      <TableCell>{amount(run.statement_balance, unit)}</TableCell>
                      <TableCell className={run.discrepancy === "0" ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                        {amount(run.discrepancy, unit)}
                      </TableCell>
                      <TableCell>{persian(run.matched_count)}</TableCell>
                      <TableCell>{persian(run.open_book_count + run.open_statement_count)}</TableCell>
                      <TableCell><StatusBadge status={run.status} /></TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs text-muted">{run.notes || "—"}</TableCell>
                      <TableCell>
                        <TableRowActions label={`عملیات ${displayDate(run.as_of_date)}`}>
                          <TableRowAction
                            onClick={() => {
                                recon.setActiveRun(run);
                                setDecisionStatus((run.status as "reviewed" | "disputed" | "completed") || "reviewed");
                                setDecisionNotes(run.notes || "");
                            }}
                            kind="edit"
                          >
                            مشاهده و اصلاح تصمیم
                          </TableRowAction>
                        </TableRowActions>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          )}
        </>
      ) : (
        <EmptyState
          title={hasCandidates ? "لطفاً یک طرف‌حساب انتخاب کنید" : "طرف‌حسابی برای تطبیق موجود نیست"}
          action={
            !hasCandidates ? (
              <ButtonLink href="/commercial/counterparties">مدیریت طرف‌حساب‌ها</ButtonLink>
            ) : undefined
          }
        />
      )}

      <Drawer
        title="ورود صورت‌حساب ارسالی طرف‌حساب"
        open={statementDrawerOpen}
        onOpenChange={setStatementDrawerOpen}
      >
        <div className="space-y-6">
          <div className="rounded-xl border border-primary/20 bg-primary-soft/30 p-4">
            <h4 className="font-medium text-sm text-primary-dark">چسباندن از اکسل</h4>
            <div className="mt-3">
              <Textarea
                rows={4}
                value={recon.rawPastedText}
                placeholder={"۱۴۰۳/۰۲/۱۰\tINV-101\t100000000\t0\tفاکتور\n۱۴۰۳/۰۲/۱۵\tPAY-201\t0\t40000000\tحواله"}
                onChange={(e) => recon.parsePastedTable(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">
                ردیف‌های آماده تطبیق ({persian(recon.statementRows.length)} ردیف)
              </h4>
              {recon.statementRows.length > 0 && (
                <Button variant="ghost" className="text-xs" onClick={recon.clearRows}>
                  پاک‌کردن همه
                </Button>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-5">
              <Input
                placeholder="تاریخ (YYYY-MM-DD)"
                value={newRow.date}
                onChange={(e) => setNewRow({ ...newRow, date: e.target.value })}
              />
              <Input
                placeholder="شماره مدرک"
                value={newRow.reference}
                onChange={(e) => setNewRow({ ...newRow, reference: e.target.value })}
              />
              <Input
                placeholder="بدهکار طرف‌حساب"
                value={newRow.debit}
                onChange={(e) => setNewRow({ ...newRow, debit: e.target.value })}
              />
              <Input
                placeholder="بستانکار طرف‌حساب"
                value={newRow.credit}
                onChange={(e) => setNewRow({ ...newRow, credit: e.target.value })}
              />
              <div className="flex gap-2">
                <Input
                  placeholder="شرح"
                  value={newRow.description}
                  onChange={(e) => setNewRow({ ...newRow, description: e.target.value })}
                />
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (newRow.date && (newRow.debit !== "0" || newRow.credit !== "0")) {
                      recon.addManualRow(newRow);
                      setNewRow({
                        date: recon.asOfDate,
                        reference: "",
                        debit: "0",
                        credit: "0",
                        description: "",
                      });
                    }
                  }}
                >
                  <PlusIcon size={16} />
                </Button>
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              <Table
                title="ردیف‌های صورت‌حساب طرف‌حساب"
                onImport={handleImportStatementExcel}
              >
                <TableHeader>
                  <TableRow>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>شماره مدرک</TableHead>
                    <TableHead>بدهکار</TableHead>
                    <TableHead>بستانکار</TableHead>
                    <TableHead>شرح</TableHead>
                    <TableHead><span className="sr-only">عملیات</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recon.statementRows.length ? (
                    recon.statementRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{row.date}</TableCell>
                        <TableCell>{row.reference || "—"}</TableCell>
                        <TableCell>{amount(row.debit, unit)}</TableCell>
                        <TableCell>{amount(row.credit, unit)}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{row.description}</TableCell>
                        <TableCell>
                          <TableRowActions label={`عملیات ${row.reference || persian(idx + 1)}`}>
                            <TableRowAction
                              onClick={() => recon.removeRow(idx)}
                              icon={<TrashIcon size={16} />}
                              danger
                            >
                              حذف ردیف
                            </TableRowAction>
                          </TableRowActions>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableEmptyCell colSpan={6} title="هنوز ردیفی از صورت‌حساب وارد نشده است" />
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setStatementDrawerOpen(false)}>
                تأیید و بستن
              </Button>
            </div>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
