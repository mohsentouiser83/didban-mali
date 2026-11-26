"use client";

import { TrashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ErrorState, StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FieldError, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import { accountRoleLabel } from "@/lib/account-catalogue";
import { listItems } from "@/lib/api";
import { amount } from "@/lib/utils";
import { emptyLine } from "@/hooks/use-commercial-documents";
import type { useCommercialDocuments } from "@/hooks/use-commercial-documents";

export function CommercialDocumentEditor({ view }: { view: Pick<ReturnType<typeof useCommercialDocuments>,
    "workspace" |
    "isSale" |
    "counterparties" |
    "accounts" |
    "cmd" |
    "createOpen" |
    "setCreateOpen" |
    "setPartyQuickCreateOpen" |
    "setViewingParty" |
    "issueDate" |
    "setIssueDate" |
    "dueDate" |
    "setDueDate" |
    "partyId" |
    "setPartyId" |
    "setWarehouseId" |
    "invoiceDiscount" |
    "setInvoiceDiscount" |
    "settlementType" |
    "setSettlementType" |
    "cashAmount" |
    "setCashAmount" |
    "chequeAmount" |
    "setChequeAmount" |
    "onAccountAmount" |
    "setOnAccountAmount" |
    "chequeNumber" |
    "setChequeNumber" |
    "chequeDueDate" |
    "setChequeDueDate" |
    "accountOverrides" |
    "setAccountOverrides" |
    "docDesc" |
    "setDocDesc" |
    "lines" |
    "setLines" |
    "clientErrors" |
    "lineErrors" |
    "setLineErrors" |
    "cpOptions" |
    "goodsItems" |
    "itemOptions" |
    "whOptions" |
    "effectiveWarehouseId" |
    "totals" |
    "parsedCashAmount" |
    "parsedChequeAmount" |
    "parsedOnAccountAmount" |
    "accountConfig" |
    "selectedAccountId" |
    "clearClientError" |
    "handleCreateDoc"
  > }) {
  const {
    workspace,
    isSale,
    counterparties,
    accounts,
    cmd,
    createOpen,
    setCreateOpen,
    setPartyQuickCreateOpen,
    setViewingParty,
    issueDate,
    setIssueDate,
    dueDate,
    setDueDate,
    partyId,
    setPartyId,
    setWarehouseId,
    invoiceDiscount,
    setInvoiceDiscount,
    settlementType,
    setSettlementType,
    cashAmount,
    setCashAmount,
    chequeAmount,
    setChequeAmount,
    onAccountAmount,
    setOnAccountAmount,
    chequeNumber,
    setChequeNumber,
    chequeDueDate,
    setChequeDueDate,
    accountOverrides,
    setAccountOverrides,
    docDesc,
    setDocDesc,
    lines,
    setLines,
    clientErrors,
    lineErrors,
    setLineErrors,
    cpOptions,
    goodsItems,
    itemOptions,
    whOptions,
    effectiveWarehouseId,
    totals,
    parsedCashAmount,
    parsedChequeAmount,
    parsedOnAccountAmount,
    accountConfig,
    selectedAccountId,
    clearClientError,
    handleCreateDoc,
  } = view;
  return (
    <Drawer
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && !cmd.busy) {
            cmd.clearError();
            setCreateOpen(false);
          }
        }}
        title={isSale ? "ثبت فاکتور فروش چندردیفی" : "ثبت فاکتور خرید چندردیفی"}
        description="تخفیف کل فاکتور طبق D24/D27 با الگوریتم بزرگ‌ترین باقیمانده بین ردیف‌ها تسهیم می‌شود."
        className="sm:max-w-3xl"
      >
        <Form
          onSubmit={(e) => {
            e.preventDefault();
            handleCreateDoc();
          }}
          fieldErrors={{ ...cmd.error?.fields, ...clientErrors }}
        >
          {accounts.error && (
            <ErrorState message={accounts.error.message} onRetry={accounts.refresh} />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Field id="cd-party" name="party_id" label="طرف حساب" required>
                <Select
                  id="cd-party"
                  searchable
                  value={partyId}
                  onValueChange={(v) => {
                    setPartyId(v);
                    clearClientError("party_id");
                  }}
                  options={cpOptions}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                {partyId && (
                  <Button
                    variant="ghost"
                    className="min-h-8 px-2 text-xs"
                    onClick={() => {
                      const found = listItems(counterparties.data).find((c) => c.id === partyId);
                      if (found) setViewingParty(found);
                    }}
                  >
                    مشاهده پرونده طرف‌حساب
                  </Button>
                )}
                {workspace.canWrite && (
                  <Button
                    variant="ghost"
                    className="min-h-8 px-2 text-xs"
                    onClick={() => setPartyQuickCreateOpen(true)}
                  >
                    تعریف طرف‌حساب جدید
                  </Button>
                )}
              </div>
            </div>
            {totals.hasGoods && (
              <Field id="cd-wh" name="warehouse_id" label="انبار (برای اقلام کالایی — D33)" required>
                <Select
                  id="cd-wh"
                  value={effectiveWarehouseId}
                  onValueChange={(v) => {
                    setWarehouseId(v);
                    clearClientError("warehouse_id");
                  }}
                  options={whOptions}
                />
              </Field>
            )}
            <Field id="cd-issue-date" name="issue_date" label="تاریخ صدور" required>
              <PersianDatePicker
                id="cd-issue-date"
                value={issueDate}
                onChange={(v) => {
                  setIssueDate(v);
                  clearClientError("issue_date", "due_date");
                }}
              />
            </Field>
            <Field id="cd-due-date" name="due_date" label="سررسید (اختیاری)">
              <PersianDatePicker
                id="cd-due-date"
                value={dueDate}
                onChange={(v) => {
                  setDueDate(v);
                  clearClientError("due_date");
                }}
              />
            </Field>
            <Field id="cd-inv-disc" name="invoice_discount" label="تخفیف کل فاکتور (ریال)">
              <AmountInput
                id="cd-inv-disc"
                value={invoiceDiscount}
                onValueChange={(v) => {
                  setInvoiceDiscount(v);
                  clearClientError("invoice_discount", "on_account_amount");
                }}
              />
            </Field>
            <Field id="cd-settlement" name="settlement_type" label="نحوه تسویه" required>
              <Select
                id="cd-settlement"
                value={settlementType}
                onValueChange={(v) => {
                  setSettlementType(v as "on_account" | "cash" | "mixed");
                  clearClientError(
                    "cash_amount",
                    "cheque_amount",
                    "on_account_amount",
                    "cheque_number",
                    "cheque_due_date",
                    "counterparty_account_id",
                    "cash_account_id",
                    "cheque_account_id",
                  );
                }}
                options={[
                  { value: "on_account", label: "نسیه (حساب)" },
                  { value: "cash", label: "نقدی کامل" },
                  { value: "mixed", label: "ترکیبی (نقد + چک + نسیه)" },
                ]}
              />
            </Field>
          </div>

          <Field id="cd-desc" name="description" label="شرح سند">
            <Input id="cd-desc" value={docDesc} onChange={(e) => setDocDesc(e.target.value)} />
          </Field>

          <div className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">ردیف‌های فاکتور</span>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setLines((prev) => [...prev, emptyLine(Date.now())]);
                  clearClientError("invoice_discount", "on_account_amount");
                }}
              >
                افزودن ردیف
              </Button>
            </div>
            {lines.map((line, index) => {
              const lErr = lineErrors[line.key] ?? {};
              return (
                <div key={line.key} className="space-y-2 rounded-lg border border-border/70 p-2.5">
                  <div className="grid gap-2 sm:grid-cols-6">
                    <Select
                      id={`cd-line-${index}-kind`}
                      label={`نوع ردیف ${index + 1}`}
                      value={line.line_kind}
                      onValueChange={(v) => {
                        const nextKind = v as "goods" | "service";
                        setLines((prev) =>
                          prev.map((r) =>
                            r.key === line.key
                              ? { ...r, line_kind: nextKind, item_id: nextKind === "service" ? "" : r.item_id }
                              : r,
                          ),
                        );
                        setLineErrors((prev) => {
                          const copy = { ...prev };
                          delete copy[line.key];
                          return copy;
                        });
                        clearClientError(
                          "warehouse_id",
                          "revenue_account_id",
                          "cost_account_id",
                          "service_revenue_account_id",
                          "expense_account_id",
                        );
                      }}
                      options={[
                        { value: "goods", label: "کالا" },
                        { value: "service", label: "خدمت" },
                      ]}
                    />
                    {line.line_kind === "goods" ? (
                      <Select
                        id={`cd-line-${index}-item`}
                        label={`کالای ردیف ${index + 1}`}
                        aria-invalid={Boolean(lErr.item_id) || undefined}
                        searchable
                        value={line.item_id}
                        onValueChange={(v) => {
                          const picked = goodsItems.find((i) => i.id === v);
                          setLines((prev) =>
                            prev.map((r) =>
                              r.key === line.key
                                ? {
                                    ...r,
                                    item_id: v,
                                    description: r.description.trim() ? r.description : picked?.name || "",
                                  }
                                : r,
                            ),
                          );
                          setLineErrors((prev) => ({
                            ...prev,
                            [line.key]: { ...prev[line.key], item_id: undefined },
                          }));
                        }}
                        options={itemOptions}
                      />
                    ) : (
                      <span className="self-center text-xs text-muted">خدمت غیرموجودی</span>
                    )}
                    <Input
                      id={`cd-line-${index}-desc`}
                      aria-label={`شرح ردیف ${index + 1}`}
                      placeholder="شرح"
                      value={line.description}
                      onChange={(e) =>
                        setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, description: e.target.value } : r)))
                      }
                    />
                    <Input
                      id={`cd-line-${index}-qty`}
                      aria-label={`تعداد ردیف ${index + 1}`}
                      aria-invalid={Boolean(lErr.quantity) || undefined}
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => {
                        setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, quantity: e.target.value } : r)));
                        setLineErrors((prev) => ({
                          ...prev,
                          [line.key]: { ...prev[line.key], quantity: undefined },
                        }));
                        clearClientError("invoice_discount", "on_account_amount");
                      }}
                    />
                    <AmountInput
                      id={`cd-line-${index}-price`}
                      aria-label={`فی ردیف ${index + 1}`}
                      aria-invalid={Boolean(lErr.unit_price) || undefined}
                      placeholder="فی (ریال)"
                      value={line.unit_price}
                      onValueChange={(v) => {
                        setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, unit_price: v } : r)));
                        setLineErrors((prev) => ({
                          ...prev,
                          [line.key]: { ...prev[line.key], unit_price: undefined },
                        }));
                        clearClientError("invoice_discount", "on_account_amount");
                      }}
                    />
                    <div className="flex items-center gap-1">
                      <AmountInput
                        id={`cd-line-${index}-disc`}
                        aria-label={`تخفیف ردیف ${index + 1}`}
                        aria-invalid={Boolean(lErr.line_discount) || undefined}
                        placeholder="تخفیف"
                        value={line.line_discount}
                        onValueChange={(v) => {
                          setLines((prev) => prev.map((r) => (r.key === line.key ? { ...r, line_discount: v } : r)));
                          setLineErrors((prev) => ({
                            ...prev,
                            [line.key]: { ...prev[line.key], line_discount: undefined },
                          }));
                          clearClientError("invoice_discount", "on_account_amount");
                        }}
                      />
                      {lines.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label="حذف ردیف"
                          onClick={() => {
                            setLines((prev) => prev.filter((r) => r.key !== line.key));
                            setLineErrors((prev) => {
                              const copy = { ...prev };
                              delete copy[line.key];
                              return copy;
                            });
                            clearClientError("invoice_discount", "on_account_amount");
                          }}
                        >
                          <TrashIcon size={16} />
                        </Button>
                      )}
                    </div>
                  </div>
                  {(lErr.item_id || lErr.quantity || lErr.unit_price || lErr.line_discount) && (
                    <div className="space-y-1">
                      <FieldError>{lErr.item_id}</FieldError>
                      <FieldError>{lErr.quantity}</FieldError>
                      <FieldError>{lErr.unit_price}</FieldError>
                      <FieldError>{lErr.line_discount}</FieldError>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-canvas/70 px-3 py-2 text-xs">
              <span className="text-muted">
                جمع ناخالص: <span className="tabular-nums text-foreground">{amount(totals.grossTotal.toString())} ریال</span>
                {" · "}
                تخفیف‌ها:{" "}
                <span className="tabular-nums text-foreground">
                  {amount((totals.lineDiscountTotal + (totals.invoiceDiscount ?? 0n)).toString())} ریال
                </span>
              </span>
              <span className="font-medium text-foreground">
                مبلغ خالص فاکتور:{" "}
                <span className="tabular-nums text-primary">
                  {totals.netTotal !== null ? `${amount(totals.netTotal.toString())} ریال` : "—"}
                </span>
              </span>
            </div>
          </div>

          {settlementType === "mixed" && (
            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">سهم‌های تسویه ترکیبی</span>
                {parsedCashAmount !== null &&
                  parsedChequeAmount !== null &&
                  parsedOnAccountAmount !== null && (
                    <span className="text-xs text-muted">
                      جمع سهم‌ها:{" "}
                      <span className="tabular-nums font-medium text-foreground">
                        {amount((parsedCashAmount + parsedChequeAmount + parsedOnAccountAmount).toString())} ریال
                      </span>
                    </span>
                  )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field id="cd-cash" name="cash_amount" label="مبلغ نقد (ریال)">
                  <AmountInput
                    id="cd-cash"
                    value={cashAmount}
                    onValueChange={(v) => {
                      setCashAmount(v);
                      clearClientError("cash_amount", "on_account_amount", "cash_account_id");
                    }}
                  />
                </Field>
                <Field id="cd-cheque" name="cheque_amount" label="مبلغ چک (ریال)">
                  <AmountInput
                    id="cd-cheque"
                    value={chequeAmount}
                    onValueChange={(v) => {
                      setChequeAmount(v);
                      clearClientError(
                        "cheque_amount",
                        "on_account_amount",
                        "cheque_account_id",
                        "cheque_number",
                        "cheque_due_date",
                      );
                    }}
                  />
                </Field>
                <Field id="cd-on-account" name="on_account_amount" label="مبلغ نسیه (ریال)">
                  <AmountInput
                    id="cd-on-account"
                    value={onAccountAmount}
                    onValueChange={(v) => {
                      setOnAccountAmount(v);
                      clearClientError("on_account_amount", "counterparty_account_id");
                    }}
                  />
                </Field>
              </div>
              {parsedChequeAmount !== null && parsedChequeAmount > 0n && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field id="cd-cheque-number" name="cheque_number" label="شماره چک" required>
                    <Input
                      id="cd-cheque-number"
                      dir="ltr"
                      maxLength={100}
                      value={chequeNumber}
                      onChange={(e) => {
                        setChequeNumber(e.target.value);
                        clearClientError("cheque_number");
                      }}
                    />
                  </Field>
                  <Field id="cd-cheque-due-date" name="cheque_due_date" label="سررسید چک" required>
                    <PersianDatePicker
                      id="cd-cheque-due-date"
                      value={chequeDueDate}
                      onChange={(v) => {
                        setChequeDueDate(v);
                        clearClientError("cheque_due_date");
                      }}
                    />
                  </Field>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-border bg-canvas/50 p-3">
            <span className="block text-sm font-medium">حساب‌های معین و تسویه سند</span>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    slot: "revenue_account_id",
                    id: "cd-revenue-account",
                    label: "حساب درآمد فروش کالا",
                    roleHint: "نقش مجاز: درآمد یا حساب بدون نقش",
                  },
                  {
                    slot: "cost_account_id",
                    id: "cd-cost-account",
                    label: "حساب بهای تمام‌شده کالا",
                    roleHint: "نقش مجاز: هزینه یا حساب بدون نقش",
                  },
                  {
                    slot: "service_revenue_account_id",
                    id: "cd-service-revenue-account",
                    label: "حساب درآمد خدمات",
                    roleHint: "نقش مجاز: درآمد یا حساب بدون نقش",
                  },
                  {
                    slot: "expense_account_id",
                    id: "cd-expense-account",
                    label: "حساب هزینه خدمات",
                    roleHint: "نقش مجاز: هزینه یا حساب بدون نقش",
                  },
                  {
                    slot: "counterparty_account_id",
                    id: "cd-counterparty-account",
                    label: isSale ? "حساب دریافتنی تجاری (طرف حساب)" : "حساب پرداختنی تجاری (طرف حساب)",
                    roleHint: isSale ? "نقش مجاز: مطالبات تجاری یا بدون نقش" : "نقش مجاز: بدهی تجاری یا بدون نقش",
                  },
                  {
                    slot: "cash_account_id",
                    id: "cd-cash-account",
                    label: "حساب وجه نقد / بانک",
                    roleHint: "نقش مجاز: بانک، صندوق، تنخواه یا بدون نقش",
                  },
                  {
                    slot: "cheque_account_id",
                    id: "cd-cheque-account",
                    label: isSale ? "حساب اسناد دریافتنی (چک)" : "حساب اسناد پرداختنی (چک)",
                    roleHint: isSale ? "نقش مجاز: سایر دارایی‌ها یا بدون نقش" : "نقش مجاز: سایر بدهی‌ها یا بدون نقش",
                  },
                ] as const
              )
                .filter((item) => accountConfig[item.slot].required)
                .map((item) => {
                  const cfg = accountConfig[item.slot];
                  const options = cfg.allowedAccounts.map((a) => ({
                    value: a.id,
                    label: `${a.code} — ${a.name}${a.role ? ` (${accountRoleLabel(a.role)})` : ""}`,
                  }));
                  const description =
                    !options.length
                      ? "هیچ حساب فعالی با نقش مجاز در کدینگ شرکت یافت نشد."
                      : cfg.status === "determined" && accountOverrides[item.slot] === undefined
                        ? "تعیین‌شده از پیکربندی نقش حساب شرکت"
                        : cfg.status === "ambiguous"
                          ? "چند حساب با این نقش تعریف شده است؛ حساب مورد نظر را انتخاب کنید."
                          : item.roleHint;
                  return (
                    <Field
                      key={item.slot}
                      id={item.id}
                      name={item.slot}
                      label={item.label}
                      description={description}
                      required
                    >
                      <Select
                        id={item.id}
                        searchable
                        disabled={accounts.loading}
                        placeholder={accounts.loading ? "در حال دریافت حساب‌ها..." : "انتخاب حساب"}
                        value={selectedAccountId(item.slot)}
                        onValueChange={(v) => {
                          setAccountOverrides((prev) => ({ ...prev, [item.slot]: v }));
                          clearClientError(item.slot);
                        }}
                        options={options}
                      />
                    </Field>
                  );
                })}
            </div>
          </div>

          <FormMessage error>{cmd.error?.message}</FormMessage>
          <StatusMessage>پس از ساخت پیش‌نویس، ثبت نهایی با تأیید صریح نسخه از اسناد حسابداری انجام می‌شود.</StatusMessage>
          <Button type="submit" busy={cmd.busy} disabled={accounts.loading || !workspace.periodId}>
            ساخت پیش‌نویس فاکتور تجاری
          </Button>
        </Form>
      </Drawer>
  );
}
