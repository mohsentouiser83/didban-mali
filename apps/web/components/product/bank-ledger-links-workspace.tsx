"use client";

import Link from "next/link";
import type { Company } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerForm, DrawerFooter } from "@/components/ui/drawer";
import { FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { ControlLabel, DetailField, DetailGroup, fieldIcon } from "@/components/ui/field-layout";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableRowHeader } from "@/components/ui/table";
import { ErrorState, EmptyState, LoadingState, PageHeader, StatusMessage } from "@/components/ui/financial";
import { SelectField, SelectOption } from "./select-field";
import { useBankLedgerLinks } from "./use-bank-ledger-links";

export function BankLedgerLinksWorkspace({ company }: { company: Company }) {
  return <AccountLinks key={company.id} company={company} />;
}
function AccountLinks({ company }: { company: Company }) {
  const c = useBankLedgerLinks(company.id);
  const writable = !!company.role && ["owner", "finance_manager", "advisor"].includes(company.role);
  return <div dir="rtl" className="grid min-w-0 gap-6">
    <PageHeader title="ارتباط حساب‌های بانکی" secondaryActions={<Button variant="outline" asChild><Link href={`/companies/${company.id}/findings`}>بررسی و پیگیری</Link></Button>} />
    <section className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 sm:p-6" aria-label="حساب‌های دفتر">
      <div className="grid max-w-md gap-2">
        <ControlLabel htmlFor="ledger-account-search" icon={fieldIcon("جستجوی حساب دفتر")}>جستجوی حساب دفتر</ControlLabel>
        <Input id="ledger-account-search" value={c.search} onChange={(event) => c.setSearch(event.target.value)} placeholder="نام یا کد حساب" />
      </div>
      {c.message && <StatusMessage>{c.message}</StatusMessage>}
      {c.error ? <ErrorState onRetry={c.retry}>{c.error}</ErrorState> : c.loading ? <LoadingState label="در حال دریافت حساب‌ها"><Skeleton aria-hidden="true" className="h-64 w-full" /></LoadingState> : !c.accounts.length ? <EmptyState title={c.query ? "حسابی پیدا نشد" : "حساب دفتر موجود نیست"} hasActiveFilters={!!c.query} onClearFilters={() => c.setSearch("")} /> : <>
        {!c.banks.length && <StatusMessage>برای تعیین ارتباط، گردش بانک را بارگذاری کنید.</StatusMessage>}
        <Table className="min-w-0 table-fixed">
          <TableHeader><TableRow><TableHead className="w-[45%] whitespace-normal">حساب دفتر</TableHead><TableHead className="whitespace-normal">حساب بانکی متناظر</TableHead>{writable && <TableHead className="w-28"><span className="sr-only">عملیات</span></TableHead>}</TableRow></TableHeader>
          <TableBody>{c.accounts.map((account) => <TableRow key={account.account_id}>
            <TableRowHeader className="max-w-72 whitespace-normal"><div className="grid gap-1 break-words"><span>{account.name}</span><span dir="ltr" className="text-start text-xs text-muted-foreground">{account.code}</span></div></TableRowHeader>
            <TableCell className="whitespace-normal break-words">{c.banks.find((bank) => bank.id === account.bank_account_id)?.label ?? "تأیید نشده"}</TableCell>
            {writable && <TableCell><Button variant="outline" size="sm" className="min-h-11 whitespace-normal" disabled={!c.banks.length} onClick={() => c.edit(account)} aria-label={`تعیین حساب بانکی برای ${account.name}`}>تعیین</Button></TableCell>}
          </TableRow>)}</TableBody>
        </Table>
        <nav aria-label="صفحه‌های حساب‌ها" className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={c.page === 0} onClick={() => c.setPage((value) => value - 1)}>صفحه قبل</Button>
          <Button variant="outline" disabled={!c.hasMore} onClick={() => c.setPage((value) => value + 1)}>صفحه بعد</Button>
        </nav>
      </>}
    </section>
    <Drawer open={!!c.selected} onOpenChange={(open) => { if (!open) c.close(); }} title="تعیین حساب بانکی متناظر" closeDisabled={c.busy}>
      {c.selected && <DrawerForm onSubmit={(event) => { event.preventDefault(); void c.save(); }} className="grid gap-5">
        <DetailGroup><DetailField label="حساب دفتر" icon={fieldIcon("حساب دفتر")}>{c.selected.name}</DetailField></DetailGroup>
        <div className="grid gap-2">
          <ControlLabel htmlFor="linked-bank-account" icon={fieldIcon("حساب بانکی")}>حساب بانکی</ControlLabel>
          <SelectField id="linked-bank-account" value={c.bankId} onValueChange={c.setBankId} disabled={c.busy}>
            <SelectOption value="">بدون ارتباط تأییدشده</SelectOption>
            {c.banks.map((bank) => <SelectOption key={bank.id} value={bank.id}>{bank.label}{bank.account_last4 ? ` — ${bank.account_last4}` : ""}</SelectOption>)}
          </SelectField>
        </div>
        {c.formError && <FormMessage>{c.formError}</FormMessage>}
        <DrawerFooter><Button type="submit" disabled={c.busy || (c.selected.bank_account_id ?? "") === c.bankId}>{c.busy ? "در حال ذخیره و بررسی…" : "ذخیره و بررسی دوباره"}</Button></DrawerFooter>
      </DrawerForm>}
    </Drawer>
  </div>;
}
