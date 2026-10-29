"use client";
import { Button } from "@/components/ui/button";
import { Field, Input, FieldDescription } from "@/components/ui/field";
import { usePayrollTaxTable } from "./use-payroll-tax-table";

export function PayrollTaxTable() {
  const tax = usePayrollTaxTable();
  return (
    <section className="space-y-3" aria-label="جدول مالیات حقوق">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">معافیت و پلکان مالیات</h3>
        <Button variant="secondary" onClick={tax.load}>
          استفاده از جدول ۱۴۰۵
        </Button>
      </div>
      {tax.loaded ? (
        <>
          <Input
            type="hidden"
            name="tax_table_source_url"
            value={tax.sourceUrl}
            readOnly
          />
          <div role="status" className="space-y-1">
            <FieldDescription>
              {tax.matchesOfficialTable
                ? "جدول حقوق عادی ۱۴۰۵ درج شد؛ شمول مزایا و پرداخت‌های خاص جداست."
                : "جدول ویرایش شده است؛ مقادیر را با سند مبنا بررسی کنید."}
            </FieldDescription>
            <Button asChild variant="ghost">
              <a href={tax.sourceUrl} target="_blank" rel="noreferrer">
                سند رسمی، صفحهٔ ۹
              </a>
            </Button>
          </div>
        </>
      ) : null}
      <Field id="tax_exemption_monthly" label="معافیت ماهانه مالیات — ریال">
        <Input
          id="tax_exemption_monthly"
          name="tax_exemption_monthly"
          value={tax.exemption}
          onChange={(e) => tax.setExemption(e.target.value)}
          inputMode="decimal"
          dir="ltr"
          required
          pattern="[0-9]+([.][0-9]{1,6})?"
        />
      </Field>
      <FieldDescription>حد بالای پله‌ها پس از کسر معافیت است.</FieldDescription>
      {tax.bands.map((band, i) => (
        <div key={i} className="grid gap-3 sm:grid-cols-2">
          <Field
            id={`band_upper_${i}`}
            label={
              i === tax.bands.length - 1
                ? "حد آخر؛ خالی یعنی بدون سقف"
                : "حد بالا — ریال"
            }
          >
            <Input
              id={`band_upper_${i}`}
              name={`band_upper_${i}`}
              value={band.up_to}
              onChange={(e) => tax.update(i, "up_to", e.target.value)}
              inputMode="decimal"
              dir="ltr"
              required={i !== tax.bands.length - 1}
              pattern="[0-9]+([.][0-9]{1,6})?"
            />
          </Field>
          <Field id={`band_rate_${i}`} label="نرخ">
            <Input
              id={`band_rate_${i}`}
              name={`band_rate_${i}`}
              value={band.rate}
              onChange={(e) => tax.update(i, "rate", e.target.value)}
              inputMode="decimal"
              dir="ltr"
              required
              pattern="[0-9]+([.][0-9]{1,6})?"
            />
          </Field>
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={tax.add}
        disabled={tax.bands.length >= 12}
      >
        افزودن پله
      </Button>
    </section>
  );
}
