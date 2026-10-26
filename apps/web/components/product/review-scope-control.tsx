"use client";
import { FieldError } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerForm, DrawerFooter } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { ErrorState, LoadingState, EmptyState } from "@/components/ui/financial";
import { SelectField, SelectOption } from "./select-field";
import { useReviewScope } from "./use-review-scope";
import type { ReviewScope } from "@/lib/review-scope";

export function ReviewScopeControl({ companyId, busy, onApply }: { companyId: string; busy: boolean; onApply: (scope: ReviewScope) => void }) {
  const c = useReviewScope(companyId, onApply);
  return <>
    <Button variant="outline" disabled={busy} onClick={() => c.setOpen(true)}>حساب و بازه بررسی</Button>
    <Drawer open={c.open} onOpenChange={c.setOpen} title="دامنه تطبیق بانک و حسابداری">
      {c.loading ? <LoadingState label="در حال دریافت حساب‌ها" /> : c.error ? <ErrorState onRetry={c.retry}>{c.error}</ErrorState> : !c.banks.length ? <EmptyState title="گردش بانکی بارگذاری نشده است" /> : <DrawerForm onSubmit={(event) => { event.preventDefault(); if (!c.apply()) event.currentTarget.querySelector<HTMLButtonElement>("#review-bank-account")?.focus(); }} className="grid gap-5">
        <div className="grid gap-2"><ControlLabel htmlFor="review-bank-account" icon={fieldIcon("حساب بانکی")}>حساب بانکی</ControlLabel><SelectField id="review-bank-account" required isInvalid={!!c.accountError} aria-describedby={c.accountError ? "review-bank-error" : undefined} value={c.scope.bank_account_id} onValueChange={(value) => c.update({ bank_account_id: value })} placeholder="انتخاب حساب"><SelectOption value="">انتخاب حساب</SelectOption>{c.banks.map((bank) => <SelectOption key={bank.id} value={bank.id}>{bank.label}</SelectOption>)}</SelectField>{c.accountError && <FieldError id="review-bank-error">{c.accountError}</FieldError>}</div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><ControlLabel htmlFor="review-period-start" icon={fieldIcon("از تاریخ")}>از تاریخ</ControlLabel><PersianDatePicker id="review-period-start" required value={c.scope.period_start} max={c.scope.period_end || undefined} onValueChange={(value) => c.update({ period_start: value })} /></div><div className="grid gap-2"><ControlLabel htmlFor="review-period-end" icon={fieldIcon("تا تاریخ")}>تا تاریخ</ControlLabel><PersianDatePicker id="review-period-end" required value={c.scope.period_end} min={c.scope.period_start || undefined} onValueChange={(value) => c.update({ period_end: value })} /></div></div>
        <fieldset className="grid gap-3"><legend className="mb-3 text-sm font-medium">پوشش بازه برای این حساب</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm" htmlFor="ledger-complete"><Checkbox id="ledger-complete" checked={c.scope.accounting_complete} onCheckedChange={(value) => c.update({ accounting_complete: value === true })} />گردش حساب دفتر در این بازه کامل است</label>
          <label className="flex min-h-11 items-center gap-3 text-sm" htmlFor="bank-complete"><Checkbox id="bank-complete" checked={c.scope.bank_complete} onCheckedChange={(value) => c.update({ bank_complete: value === true })} />گردش بانک در این بازه کامل است</label>
        </fieldset>
        <DrawerFooter><Button type="submit" disabled={busy}>{busy ? "در حال بررسی…" : "اجرای بررسی"}</Button></DrawerFooter>
      </DrawerForm>}
    </Drawer>
  </>;
}
