"use client";
import { useUploadWizard, downloadTemplate, type UploadWizardProps } from "./use-upload-wizard";
import { DetailGroup, ControlLabel, fieldIcon, DetailField } from "@/components/ui/field-layout";
import { ImportStructureSettings } from "./import-structure-settings";
import { FieldDescription } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form";
import { ErrorState, LoadingState, toPersianDigits } from "@/components/ui/financial";

import { fieldLabels, sourceLabels } from "@/lib/import-mapping";
import type { ImportBatch } from "@/lib/product-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DrawerFooter, DrawerForm } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "@/components/ui/icons";

export function UploadWizard(props: UploadWizardProps) {
  const { onCancel } = props;
  const { batch, step, setStep, sourceKind, setSourceKind, sourceLabel, setSourceLabel, bankAccounts, bankAccountId, setBankAccountId, accountsError, setAccountsRetry, file, busy, error, scanError, previewError, setRetry, preview, amountMode, setAmountMode, mapping, setMapping, currency, setCurrency, calendar, setCalendar, headerRow, setHeaderRow, sheet, setSheet, setPreviewQuery, previewQuery, validation, issues, issuesError, bankReady, selectedAccount, upload, selectFile, confirm, commit, revise, mappingComplete, essential, optional, alternatives, hasAmounts, layout, setLayout, scope, setScope, inheritedColumns, bankColumns, profileName, setProfileName, invoices, accountStructure, changeAccountStructure } = useUploadWizard(props);
  function fieldSelect(field: string) {
    const label = field === "amount_direction" ? (sourceKind === "bank" ? "جهت گردش (دید بانک)" : "جهت گردش (دید دفاتر)") : sourceKind.startsWith("settlement_") && field === "payment_date" ? "تاریخ تسویه" : fieldLabels[field] ?? field;
    return <div key={field}><ControlLabel htmlFor={`column-${field}`} icon={fieldIcon(label)}>{label}{preview?.required_fields.includes(field) ? " *" : ""}</ControlLabel><Select dir="rtl" value={mapping[field] || "none"} disabled={busy || !!preview?.mapping} onValueChange={(value) => setMapping((current) => ({ ...current, [field]: value === "none" ? "" : value }))}><SelectTrigger id={`column-${field}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">انتخاب نشده</SelectItem>{preview?.columns.map((column) => <SelectItem key={column} value={column}>{column}</SelectItem>)}</SelectContent></Select></div>;
  }
  return <div className="flex min-w-0 flex-1 flex-col gap-7">
    <ol className="grid grid-cols-3 gap-3 border-b border-border pb-6 [&_li]:flex [&_li]:flex-col [&_li]:items-start [&_li]:gap-2 [&_li]:text-xs [&_li]:text-muted-foreground sm:[&_li]:flex-row sm:[&_li]:items-center [&_li[data-active=true]]:font-medium [&_li[data-active=true]]:text-primary [&_li>span]:grid [&_li>span]:size-7 [&_li>span]:shrink-0 [&_li>span]:place-items-center [&_li>span]:rounded-full [&_li>span]:border [&_li>span]:border-border [&_li[data-active=true]>span]:border-primary [&_li[data-active=true]>span]:bg-primary/10" aria-label="مراحل بارگذاری">{["انتخاب فایل", "تأیید اطلاعات", "ثبت سند"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} data-active={step === index + 1}><span>{toPersianDigits(index + 1)}</span>{label}</li>)}</ol>
    {step === 1 && !batch && <DrawerForm onSubmit={(event) => void upload(event)}>
      <div><ControlLabel htmlFor="import-kind" className="mb-2 block text-sm" icon={fieldIcon("نوع سند")}>نوع سند</ControlLabel><Select dir="rtl" value={sourceKind} disabled={busy} onValueChange={(value) => setSourceKind(value as ImportBatch["source_kind"])}><SelectTrigger id="import-kind"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(sourceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      {sourceKind === "bank" && <div>
        <ControlLabel htmlFor="import-bank-account" icon={fieldIcon("حساب بانکی")}>حساب بانکی</ControlLabel>
        {accountsError ? <ErrorState onRetry={() => setAccountsRetry((value) => value + 1)} variant="compact" ><p>{accountsError}</p></ErrorState> : bankAccounts === null ? <LoadingState variant="inline" >در حال دریافت حساب‌ها…</LoadingState> : <>
          <Select dir="rtl" value={bankAccountId} disabled={busy} onValueChange={setBankAccountId}>
            <SelectTrigger id="import-bank-account"><SelectValue placeholder="انتخاب حساب بانکی" /></SelectTrigger>
            <SelectContent>{bankAccounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.label}{account.account_last4 ? ` — ${account.account_last4}` : ""}</SelectItem>)}<SelectItem value="new">افزودن حساب جدید</SelectItem></SelectContent>
          </Select>

        </>}
      </div>}
      {(sourceKind !== "bank" || bankAccountId === "new") && <div><ControlLabel htmlFor="import-label" icon={fieldIcon(sourceKind === "bank" ? "نام حساب جدید" : "عنوان منبع (اختیاری)")}>{sourceKind === "bank" ? "نام حساب جدید" : "عنوان منبع (اختیاری)"}</ControlLabel><Input id="import-label" maxLength={160} minLength={sourceKind === "bank" ? 2 : undefined} required={sourceKind === "bank"} placeholder={sourceKind === "bank" ? "مثلاً بانک ملت — حساب جاری شرکت" : "مثلاً دفتر حسابداری مهر"} value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} disabled={busy} /></div>}
      <div className="grid min-w-0 gap-2"><ControlLabel htmlFor="import-file" icon={fieldIcon("فایل سند")}>فایل سند</ControlLabel><FileInput id="import-file" fileName={file?.name} accept=".csv,.xls,.xlsx,.pdf" disabled={busy} onChange={(event) => selectFile(event.target.files?.[0])} aria-invalid={error ? true : undefined} aria-describedby={["import-file-hint", error ? "import-file-error" : ""].filter(Boolean).join(" ")} /><FieldDescription id="import-file-hint">CSV، XLS، XLSX یا PDF متنی، حداکثر ۵۰ مگابایت</FieldDescription></div>
      <Button type="button" variant="outline" onClick={() => downloadTemplate(sourceKind)} disabled={busy}><Download size={16} aria-hidden="true" />دریافت فایل نمونه</Button>
      {error && <FormMessage id="import-file-error">{error}</FormMessage>}
      <DrawerFooter><Button type="button" variant="outline" onClick={onCancel} disabled={busy}>انصراف</Button><Button type="submit" disabled={busy || !file || !bankReady}>{busy ? "در حال بارگذاری…" : "ادامه"}</Button></DrawerFooter>
    </DrawerForm>}
    {step === 1 && batch && <><p className="min-w-0 text-sm text-muted-foreground"><bdi>{batch.original_name}</bdi></p><LoadingState variant="inline" >در حال بررسی فایل…</LoadingState>{(scanError || batch.failure_message) && <ErrorState onRetry={() => setRetry((value) => value + 1)} variant="compact" ><p>{scanError || batch.failure_message}</p></ErrorState>}<DrawerFooter><Button variant="outline" onClick={onCancel}>بستن</Button></DrawerFooter></>}
    {step === 2 && <>{previewError ? <ErrorState onRetry={() => setRetry((value) => value + 1)} variant="compact" ><p>{previewError}</p></ErrorState> : !preview ? <Skeleton className="h-48 w-full" /> : <DrawerForm onSubmit={(event) => void confirm(event)}>
      <p className="min-w-0 text-sm text-muted-foreground"><bdi>{batch?.original_name}</bdi></p>
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <div><ControlLabel htmlFor="import-currency" icon={fieldIcon("واحد مبلغ")}>واحد مبلغ</ControlLabel><Select dir="rtl" value={currency} onValueChange={(value) => setCurrency(value as "rial" | "toman")} disabled={busy || !!preview.mapping}><SelectTrigger id="import-currency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="rial">ریال</SelectItem><SelectItem value="toman">تومان</SelectItem></SelectContent></Select></div>
        <div><ControlLabel htmlFor="import-calendar" icon={fieldIcon("تقویم تاریخ‌ها")}>تقویم تاریخ‌ها</ControlLabel><Select dir="rtl" value={calendar} onValueChange={(value) => setCalendar(value as "jalali" | "gregorian")} disabled={busy || !!preview.mapping}><SelectTrigger id="import-calendar"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="jalali">شمسی</SelectItem><SelectItem value="gregorian">میلادی</SelectItem></SelectContent></Select></div>
      </div>
      {sourceKind === "accounting" && <div><ControlLabel htmlFor="account-structure" icon={fieldIcon("ساختار حساب")}>ساختار حساب</ControlLabel><Select dir="rtl" value={accountStructure} disabled={busy || !!preview.mapping} onValueChange={changeAccountStructure}><SelectTrigger id="account-structure"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="flat">کد و نام حساب</SelectItem><SelectItem value="hierarchy">کل، معین و تفصیلی</SelectItem></SelectContent></Select></div>}
      {hasAmounts && <div><ControlLabel htmlFor="amount-mode" icon={fieldIcon("ساختار مبلغ")}>ساختار مبلغ</ControlLabel><Select dir="rtl" value={amountMode} disabled={busy || !!preview.mapping} onValueChange={(value) => {
        setAmountMode(value); setMapping((current) => { const next = { ...current }; for (const field of value === "net" ? ["deposit_amount", "withdrawal_amount", "debit", "credit"] : ["amount_signed", "amount_direction"]) delete next[field]; return next; });
      }}><SelectTrigger id="amount-mode"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="net">یک ستون مبلغ خالص</SelectItem><SelectItem value="split">{sourceKind === "accounting" ? "دو ستون بدهکار و بستانکار" : "دو ستون واریز و برداشت"}</SelectItem></SelectContent></Select></div>}
      <div className="grid min-w-0 gap-5 sm:grid-cols-2">{essential.map(fieldSelect)}</div>
      {sourceKind.startsWith("settlement_") && <FieldDescription>برای اتصال خودکار، شماره مالیاتی یا شماره فاکتور و شناسه طرف معامله، همراه شناسه بانکی را تطبیق دهید. شناسه ردیف تسویه باید در خروجی‌های بعدی ثابت بماند.</FieldDescription>}
      <section className="grid gap-5 border-t border-border pt-5"><h3 className="text-sm font-medium">ستون‌های اختیاری و تنظیمات فایل</h3><div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <div><ControlLabel htmlFor="import-sheet" icon={fieldIcon("شیت")}>شیت</ControlLabel><Select dir="rtl" value={sheet} disabled={busy || !!preview.mapping} onValueChange={setSheet}><SelectTrigger id="import-sheet"><SelectValue /></SelectTrigger><SelectContent>{preview.sheets.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
        <div><ControlLabel htmlFor="import-header" icon={fieldIcon("ردیف عنوان")}>ردیف عنوان</ControlLabel><Input id="import-header" type="number" min={1} max={100} value={headerRow} disabled={busy || !!preview.mapping} onChange={(event) => setHeaderRow(Number(event.target.value))} /></div>
        <div><ControlLabel htmlFor="import-header-rows" icon={fieldIcon("تعداد سطرهای عنوان")}>تعداد سطرهای عنوان</ControlLabel><Input id="import-header-rows" type="number" min={1} max={5} value={layout.header_rows} disabled={busy || !!preview.mapping} onChange={(event) => setLayout({ ...layout, header_rows: Number(event.target.value) })} /></div>
        {!preview.mapping && <Button type="button" variant="outline" disabled={busy || !Number.isInteger(layout.header_rows) || layout.header_rows < 1 || layout.header_rows > 5 || !Number.isInteger(headerRow) || headerRow < 1 || headerRow > 100} onClick={() => { const params = new URLSearchParams({ sheet_name: sheet, header_row: String(headerRow), header_rows: String(layout.header_rows) }); const next = `?${params}`; if (next === previewQuery) setRetry((value) => value + 1); else setPreviewQuery(next); }}>خواندن ستون‌ها</Button>}
        {optional.map(fieldSelect)}
      </div></section>
      <ImportStructureSettings layout={layout} scope={scope} inheritedColumns={inheritedColumns} bankColumns={bankColumns} invoices={invoices} accounting={sourceKind === "accounting" && invoices} disabled={busy || !!preview.mapping} onLayout={setLayout} onScope={setScope} profileName={profileName} onProfileName={setProfileName} />
      {batch?.duplicate_detected && <p className="text-sm leading-relaxed text-muted-foreground">این فایل قبلاً بارگذاری شده است.</p>}
      {error && <FormMessage>{error}</FormMessage>}
      <DrawerFooter><Button type="button" variant="outline" onClick={onCancel} disabled={busy}>بستن</Button><Button type="submit" disabled={busy || !mappingComplete}>{busy ? "در حال بررسی…" : "ادامه"}</Button></DrawerFooter>
    </DrawerForm>}</>}
    {step === 3 && batch && <>
      <p className="min-w-0 text-sm text-muted-foreground"><bdi>{batch.original_name}</bdi></p>
      <DetailGroup><DetailField icon={fieldIcon("کل ردیف‌ها")} label="کل ردیف‌ها">{toPersianDigits(batch.row_count ?? 0)}</DetailField><DetailField icon={fieldIcon("قابل ثبت")} label="قابل ثبت">{toPersianDigits(batch.accepted_count ?? 0)}</DetailField><DetailField icon={fieldIcon("ردیف‌های دارای خطا")} label="ردیف‌های دارای خطا">{toPersianDigits(batch.rejected_count ?? 0)}</DetailField></DetailGroup>
      {sourceKind.startsWith("settlement_") && <FieldDescription>اتصال‌های قطعی ثبت می‌شوند؛ موارد مبهم برای بررسی باقی می‌مانند.</FieldDescription>}
      {!!(batch.coverage?.row_selection as { excluded?: number } | undefined)?.excluded && <p className="text-sm text-muted-foreground">{toPersianDigits((batch.coverage?.row_selection as { excluded: number }).excluded)} ردیف خارج از حساب انتخابی کنار گذاشته شد.</p>}
      {(batch.rejected_count ?? 0) > 0 && <p className="text-sm leading-relaxed text-muted-foreground">ردیف‌های دارای خطا ثبت نمی‌شوند. پس از ثبت، جزئیات آن‌ها در صفحه ردیف‌ها در دسترس است.</p>}
      {issues?.items.length ? <section className="grid gap-4 border-t border-border pt-5"><h3 className="text-sm font-medium">ایرادها ({toPersianDigits(issues.total)})</h3><ul className="grid gap-4 text-sm leading-7">{issues.items.map((issue) => <li key={issue.id}>ردیف {toPersianDigits(issue.row_number ?? "—")} · {issue.message}{issue.remedy && <p className="text-sm leading-relaxed text-muted-foreground">{issue.remedy}</p>}</li>)}</ul></section> : null}
      {issuesError && <FormMessage>جزئیات ایرادها دریافت نشد. برای بررسی آن‌ها صفحه ردیف‌های سند را باز کنید.</FormMessage>}
      {batch.failure_message && <FormMessage>{batch.failure_message}</FormMessage>}
      {error && <FormMessage>{error}</FormMessage>}
      <DrawerFooter><Button variant="outline" onClick={() => void revise()} disabled={busy}>اصلاح ساختار</Button><Button variant="outline" onClick={onCancel} disabled={busy}>بستن</Button><Button onClick={() => void commit()} disabled={busy || !validation || (batch.accepted_count ?? 0) < 1 || !!validation.issue_counts.blocking}>{busy ? "در حال ثبت…" : "ثبت سند"}</Button></DrawerFooter>
    </>}
  </div>;
}
