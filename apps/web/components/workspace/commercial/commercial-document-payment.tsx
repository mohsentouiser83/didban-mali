import type { useCommercialDocuments } from "@/hooks/use-commercial-documents";
import { ErrorState } from "@/components/ui/content-states";
import { Field } from "@/components/ui/field";
import { AmountInput, Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import { accountRoleLabel } from "@/lib/account-catalogue";
import { amount } from "@/lib/utils";

export function CommercialDocumentPayment({ view }: { view: ReturnType<typeof useCommercialDocuments> }) {
  const {
    isSale,
    accounts,
    dueDate,
    setDueDate,
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
    setAccountOverrides,
    parsedCashAmount,
    parsedChequeAmount,
    parsedOnAccountAmount,
    accountConfig,
    selectedAccountId,
    clearClientError,
  } = view;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
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
        <Field id="cd-due-date" name="due_date" label="سررسید (اختیاری)">
          <PersianDatePicker
            id="cd-due-date"
            label="سررسید فاکتور"
            value={dueDate}
            onChange={(v) => {
              setDueDate(v);
              clearClientError("due_date");
            }}
          />
        </Field>
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
                  label="سررسید چک"
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

      {accounts.error && <ErrorState message={accounts.error.message} />}

      {!isSale && (
        <div className="space-y-3 rounded-xl border border-border bg-canvas/50 p-3">
          <span className="block text-sm font-medium">حساب‌های معین و تسویه سند</span>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  slot: "expense_account_id",
                  id: "cd-expense-account",
                  label: "حساب هزینه خدمات",
                },
                {
                  slot: "counterparty_account_id",
                  id: "cd-counterparty-account",
                  label: "حساب پرداختنی تجاری (طرف حساب)",
                },
                {
                  slot: "cash_account_id",
                  id: "cd-cash-account",
                  label: "حساب وجه نقد / بانک",
                },
                {
                  slot: "cheque_account_id",
                  id: "cd-cheque-account",
                  label: "حساب اسناد پرداختنی (چک)",
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
                const missingAccount = !accounts.loading && !accounts.error && options.length === 0;
                return (
                  <Field
                    key={item.slot}
                    id={item.id}
                    name={item.slot}
                    label={item.label}
                    error={missingAccount ? "حساب فعالی با نقش لازم موجود نیست." : undefined}
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
      )}
    </>
  );
}
