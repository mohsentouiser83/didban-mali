"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import { Disclosure } from "@/components/ui/disclosure";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { SelectField, SelectOption } from "./select-field";
import type { ImportLayout, InputScope } from "@/lib/product-types";

export function ImportStructureSettings({ layout, scope, inheritedColumns, bankColumns, invoices, accounting, disabled, onLayout, onScope, profileName, onProfileName }: {
  layout: ImportLayout; scope: InputScope; inheritedColumns: string[];
  invoices: boolean; accounting: boolean; disabled: boolean; bankColumns: string[];
  profileName: string; onProfileName: (value: string) => void;
  onLayout: (value: ImportLayout) => void; onScope: (value: InputScope) => void;
}) {
  const [open, setOpen] = useState(false);
  const incomplete = scope.completeness === "complete" && (!scope.start_date || !scope.end_date)
    || !!(scope.start_date && scope.end_date && scope.start_date > scope.end_date)
    || !!layout.row_filter_column && !layout.row_filter_value?.trim();
  return <Disclosure title="ساختار ردیف‌ها و پوشش دوره" open={open || incomplete} onOpenChange={setOpen}>
    <div className="grid gap-2"><ControlLabel htmlFor="import-profile-name" icon={fieldIcon("نام قالب")}>نام قالب (اختیاری)</ControlLabel><Input id="import-profile-name" value={profileName} minLength={2} maxLength={160} disabled={disabled} onChange={(event) => onProfileName(event.target.value)} /></div>
    <div className="grid gap-2"><ControlLabel htmlFor="number-format" icon={fieldIcon("قالب عددها")}>قالب عددها</ControlLabel><SelectField id="number-format" value={layout.number_format ?? "standard"} disabled={disabled} onValueChange={(value) => onLayout({ ...layout, number_format: value as ImportLayout["number_format"] })}><SelectOption value="standard">هزارگان ویرگول؛ 1,000</SelectOption><SelectOption value="dot_thousands">هزارگان نقطه و اعشار ویرگول؛ 1.000,00</SelectOption></SelectField></div>
    {bankColumns.length > 0 && <div className="grid gap-3"><div className="grid gap-2"><ControlLabel htmlFor="bank-row-column" icon={fieldIcon("انتخاب ردیف‌های یک حساب")}>انتخاب ردیف‌های یک حساب</ControlLabel><SelectField id="bank-row-column" value={layout.row_filter_column ?? ""} disabled={disabled} onValueChange={(value) => onLayout({ ...layout, row_filter_column: value || null })}><SelectOption value="">تمام ردیف‌ها</SelectOption>{bankColumns.map((column) => <SelectOption value={column} key={column}>{column}</SelectOption>)}</SelectField></div>{layout.row_filter_column && <div className="grid gap-2"><ControlLabel htmlFor="bank-row-value" icon={fieldIcon("شماره حساب یا شبا")}>شماره حساب یا شبا</ControlLabel><Input id="bank-row-value" required maxLength={160} dir="ltr" value={layout.row_filter_value ?? ""} disabled={disabled} onChange={(event) => onLayout({ ...layout, row_filter_value: event.target.value })} /></div>}</div>}
    {invoices && <div className="grid gap-2"><ControlLabel htmlFor="invoice-row-structure" icon={fieldIcon("ساختار فاکتور")}>ساختار فاکتور</ControlLabel><SelectField id="invoice-row-structure" value={layout.invoice_rows} disabled={disabled} onValueChange={(value) => onLayout({ ...layout, invoice_rows: value as ImportLayout["invoice_rows"] })}>
      <SelectOption value="records">هر ردیف یک فاکتور</SelectOption><SelectOption value="line_totals">هر ردیف یک قلم؛ مبلغ‌ها جمع شوند</SelectOption><SelectOption value="repeated_totals">هر ردیف یک قلم؛ مبلغ کل فاکتور تکرار شده</SelectOption>
    </SelectField></div>}
    {accounting && <div className="grid gap-2"><ControlLabel htmlFor="ledger-invoice-direction" icon={fieldIcon("جهت فاکتورهای دفتر")}>جهت فاکتورهای دفتر</ControlLabel><SelectField id="ledger-invoice-direction" value={layout.invoice_direction} disabled={disabled} onValueChange={(value) => onLayout({ ...layout, invoice_direction: value as ImportLayout["invoice_direction"] })}><SelectOption value="mixed">خرید و فروش؛ با ستون جهت فاکتور</SelectOption><SelectOption value="sales">فقط فروش</SelectOption><SelectOption value="purchases">فقط خرید</SelectOption></SelectField></div>}
    {inheritedColumns.length > 0 && <fieldset className="grid gap-2"><legend className="mb-2 text-sm font-medium">خانه‌های خالی این ستون‌ها از ردیف قبل تکمیل شوند</legend>
      {inheritedColumns.map((column, index) => <label className="flex min-h-11 items-center gap-3 text-sm" key={column} htmlFor={`inherit-column-${index}`}><Checkbox id={`inherit-column-${index}`} disabled={disabled} checked={layout.fill_down_columns.includes(column)} onCheckedChange={(checked) => onLayout({ ...layout, fill_down_columns: checked === true ? [...layout.fill_down_columns, column] : layout.fill_down_columns.filter((value) => value !== column) })} /><span className="break-words">{column}</span></label>)}
    </fieldset>}
    <div className="grid gap-2"><ControlLabel htmlFor="import-completeness" icon={fieldIcon("کامل‌بودن داده‌ها")}>کامل‌بودن داده‌ها</ControlLabel><SelectField id="import-completeness" value={scope.completeness} disabled={disabled} onValueChange={(value) => onScope({ ...scope, completeness: value as InputScope["completeness"] })}><SelectOption value="unknown">هنوز تأیید نشده</SelectOption><SelectOption value="partial">بخشی از گردش یا فاکتورها</SelectOption><SelectOption value="complete">تمام اطلاعات بازه مشخص</SelectOption></SelectField></div>
    {scope.completeness !== "unknown" && <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><ControlLabel htmlFor="import-scope-start" icon={fieldIcon("شروع دوره فایل")}>شروع دوره فایل</ControlLabel><PersianDatePicker id="import-scope-start" required={scope.completeness === "complete"} value={scope.start_date ?? ""} max={scope.end_date ?? undefined} disabled={disabled} onValueChange={(value) => onScope({ ...scope, start_date: value || null })} /></div><div className="grid gap-2"><ControlLabel htmlFor="import-scope-end" icon={fieldIcon("پایان دوره فایل")}>پایان دوره فایل</ControlLabel><PersianDatePicker id="import-scope-end" required={scope.completeness === "complete"} value={scope.end_date ?? ""} min={scope.start_date ?? undefined} disabled={disabled} onValueChange={(value) => onScope({ ...scope, end_date: value || null })} /></div></div>}
  </Disclosure>;
}
