"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select, type SelectOption } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { useCommand } from "@/hooks/use-command";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import { amount, persian } from "@/lib/utils";

interface NrvRow {
  item_id: string;
  item_name: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  total_value_irr: string;
  nrv_status: string;
  nrv_unit_irr: string | null;
  nrv_total_irr: string | null;
  lcnrv_value_irr: string;
  write_down_irr: string;
  reversible_irr: string;
}

interface NrvAssessmentResponse {
  standard: string;
  method?: string;
  as_of: string;
  total_cost_irr: string;
  total_lcnrv_irr: string;
  total_write_down_irr: string;
  total_reversible_irr: string;
  policy_status: string;
  financial_effect: boolean;
  rows: NrvRow[];
}

interface NrvQuoteState {
  sellingPrice: string;
  sellingCost: string;
  priorWriteDown: string;
}

const AUTO_ACCOUNT = "__auto__";

export function InventoryNrvDrawer({
  open,
  onOpenChange,
  accounts,
  onDraftCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: SelectOption[];
  onDraftCreated?: (draftId: string) => void;
}) {
  const workspace = useWorkspace();
  const baseAssessment = useResource<NrvAssessmentResponse>(
    open ? workspace.companyPath("accounting/inventory/nrv-assessment") : null,
  );
  const assessCmd = useCommand();
  const draftCmd = useCommand();

  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("تعدیل ذخیره کاهش ارزش موجودی (استاندارد ۸)");
  const [quotes, setQuotes] = useState<Record<string, NrvQuoteState>>({});
  const [calculated, setCalculated] = useState<NrvAssessmentResponse | null>(null);
  const [allowanceAccountId, setAllowanceAccountId] = useState(AUTO_ACCOUNT);
  const [expenseAccountId, setExpenseAccountId] = useState(AUTO_ACCOUNT);
  const [recoveryAccountId, setRecoveryAccountId] = useState(AUTO_ACCOUNT);
  const [createdDraftId, setCreatedDraftId] = useState<string | null>(null);

  const report = calculated ?? baseAssessment.data;
  const rows = (report?.rows ?? []).filter((r) => r.quantity > 0);
  const accountOptions: SelectOption[] = [
    { value: AUTO_ACCOUNT, label: "تعیین خودکار از نقش حساب شرکت" },
    ...accounts,
  ];

  function quoteKey(row: NrvRow) {
    return `${row.item_id}:${row.warehouse_id}`;
  }

  function buildPriceItems() {
    return rows
      .map((row) => {
        const q = quotes[quoteKey(row)];
        if (!q || !q.sellingPrice.trim()) return null;
        return {
          item_id: row.item_id,
          warehouse_id: row.warehouse_id,
          estimated_selling_price_irr: q.sellingPrice.trim(),
          estimated_selling_cost_irr: q.sellingCost.trim() || "0",
          prior_write_down_irr: q.priorWriteDown.trim() || "0",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }

  function runCalculation() {
    const items = buildPriceItems();
    if (!items.length) return;
    setCreatedDraftId(null);
    void assessCmd.run<NrvAssessmentResponse>(
      workspace.companyPath("accounting/inventory/nrv-assessment"),
      { body: { as_of: asOf, items } },
      (res) => setCalculated(res),
    );
  }

  function createDraft() {
    const items = buildPriceItems();
    const periodId = workspace.periodId;
    if (!items.length || !periodId) return;
    const body: Record<string, unknown> = {
      period_id: periodId,
      date: asOf,
      as_of: asOf,
      description: description.trim() || "تعدیل ذخیره کاهش ارزش موجودی (استاندارد ۸)",
      items,
    };
    if (allowanceAccountId !== AUTO_ACCOUNT) body.allowance_account_id = allowanceAccountId;
    if (expenseAccountId !== AUTO_ACCOUNT) body.expense_account_id = expenseAccountId;
    if (recoveryAccountId !== AUTO_ACCOUNT) body.recovery_account_id = recoveryAccountId;

    void draftCmd.run<{ draft: { id: string }; assessment: NrvAssessmentResponse }>(
      workspace.companyPath("accounting/inventory/nrv-draft"),
      { body },
      (res) => {
        setCalculated(res.assessment);
        setCreatedDraftId(res.draft.id);
        onDraftCreated?.(res.draft.id);
      },
      "پیش‌نویس ذخیره کاهش ارزش (D35) ایجاد شد.",
    );
  }

  const busy = assessCmd.busy || draftCmd.busy;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onOpenChange(false);
      }}
      title="ارزیابی کاهش ارزش موجودی (استاندارد ۸ — D35)"
      className="sm:max-w-4xl"
    >
      {baseAssessment.loading ? (
        <LoadingState label="در حال دریافت ارزش دفتری موجودی" variant="panels" />
      ) : baseAssessment.error ? (
        <ErrorState message={baseAssessment.error.message} />
      ) : !rows.length ? (
        <EmptyState
          title="موجودی فعالی برای ارزیابی نیست"
        />
      ) : (
        <div className="space-y-5">
          <Form
            onSubmit={(event) => {
              event.preventDefault();
              runCalculation();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="nrv-as-of" label="تاریخ ارزیابی و پیش‌نویس">
                <PersianDatePicker id="nrv-as-of" value={asOf} onChange={setAsOf} />
              </Field>
              <Field id="nrv-description" label="شرح پیش‌نویس تعدیل">
                <Input
                  id="nrv-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>کالا و انبار</TableHead>
                    <TableHead>تعداد</TableHead>
                    <TableHead>بهای تمام‌شده</TableHead>
                    <TableHead>قیمت فروش برآوردی (واحد)</TableHead>
                    <TableHead>هزینه فروش برآوردی (واحد)</TableHead>
                    <TableHead>ذخیره قبلی</TableHead>
                    <TableHead>نتیجه LCNRV / کاهش ارزش</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const key = quoteKey(row);
                    const q = quotes[key] ?? { sellingPrice: "", sellingCost: "0", priorWriteDown: "0" };
                    const hasWriteDown = row.write_down_irr !== "0";
                    const hasRecovery = row.reversible_irr !== "0";
                    return (
                      <TableRow key={key}>
                        <TableRowHeader>
                          <div className="font-medium text-foreground">{row.item_name}</div>
                          <div className="text-xs text-muted">{row.warehouse_name}</div>
                        </TableRowHeader>
                        <TableCell className="tabular-nums">{persian(row.quantity)}</TableCell>
                        <TableCell className="tabular-nums">{amount(row.total_value_irr)}</TableCell>
                        <TableCell className="min-w-36">
                          <AmountInput
                            aria-label={`قیمت فروش برآوردی ${row.item_name}`}
                            value={q.sellingPrice}
                            onValueChange={(v) =>
                              setQuotes((prev) => ({
                                ...prev,
                                [key]: { ...q, sellingPrice: v },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell className="min-w-32">
                          <AmountInput
                            aria-label={`هزینه فروش برآوردی ${row.item_name}`}
                            value={q.sellingCost}
                            onValueChange={(v) =>
                              setQuotes((prev) => ({
                                ...prev,
                                [key]: { ...q, sellingCost: v },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell className="min-w-32">
                          <AmountInput
                            aria-label={`ذخیره قبلی ${row.item_name}`}
                            value={q.priorWriteDown}
                            onValueChange={(v) =>
                              setQuotes((prev) => ({
                                ...prev,
                                [key]: { ...q, priorWriteDown: v },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell className="space-y-1 tabular-nums">
                          <div className="text-xs text-muted">LCNRV: {amount(row.lcnrv_value_irr)}</div>
                          {hasWriteDown ? (
                            <Badge tone="danger">کاهش: {amount(row.write_down_irr)}</Badge>
                          ) : hasRecovery ? (
                            <Badge tone="success">برگشت: {amount(row.reversible_irr)}</Badge>
                          ) : (
                            <Badge>بدون تعدیل</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="nrv-allow-acc" label="حساب ذخیره کاهش ارزش (اختیاری)">
                <Select
                  id="nrv-allow-acc"
                  searchable
                  value={allowanceAccountId}
                  onValueChange={setAllowanceAccountId}
                  options={accountOptions}
                />
              </Field>
              <Field id="nrv-exp-acc" label="حساب هزینه کاهش ارزش (اختیاری)">
                <Select
                  id="nrv-exp-acc"
                  searchable
                  value={expenseAccountId}
                  onValueChange={setExpenseAccountId}
                  options={accountOptions}
                />
              </Field>
              <Field id="nrv-rec-acc" label="حساب برگشت ذخیره (اختیاری)">
                <Select
                  id="nrv-rec-acc"
                  searchable
                  value={recoveryAccountId}
                  onValueChange={setRecoveryAccountId}
                  options={accountOptions}
                />
              </Field>
            </div>

            {report && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-subtle p-3 text-sm">
                <span>بهای کل: {amount(report.total_cost_irr)}</span>
                <span>ارزش LCNRV کل: {amount(report.total_lcnrv_irr)}</span>
                <span>مجموع کاهش ارزش: {amount(report.total_write_down_irr)}</span>
                <span>مجموع قابل برگشت: {amount(report.total_reversible_irr)}</span>
              </div>
            )}

            <FormMessage error>{assessCmd.error?.message || draftCmd.error?.message}</FormMessage>
            {createdDraftId && (
              <StatusMessage>
                پیش‌نویس سند ذخیره کاهش ارزش ساخته شد و تا تأیید صریح انسانی اثر مالی ندارد.
              </StatusMessage>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                variant="secondary"
                busy={assessCmd.busy}
                disabled={!buildPriceItems().length}
              >
                محاسبه LCNRV (استاندارد ۸)
              </Button>
              {workspace.canWrite && (
                <Button
                  type="button"
                  className="w-full"
                  busy={draftCmd.busy}
                  disabled={!buildPriceItems().length || !workspace.periodId}
                  onClick={createDraft}
                >
                  تهیه پیش‌نویس ذخیره (D35)
                </Button>
              )}
            </div>
          </Form>
        </div>
      )}
    </Drawer>
  );
}
