import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { DetailField } from "@/components/ui/field-layout";
import { Form } from "@/components/ui/form";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { MoadianTransmissionController } from "@/hooks/use-moadian-transmissions";
import { amount, asciiDigits, displayDate, persian } from "@/lib/utils";

const buyerOptions = [
  { value: "natural", label: "شخص حقیقی" },
  { value: "legal", label: "شخص حقوقی" },
];
const vatOptions = [
  { value: "exempt", label: "معاف" },
  { value: "zero_rated", label: "نرخ صفر" },
];
const codeFields = [
  { key: "tax_id", label: "شناسه یکتای مالیاتی", pattern: "[1-9ADEFGHKMNOPRTWXYZ]{6}[0-9A-F]{15}[0-9]", max: 22 },
  { key: "buyer_tax_number", label: "شماره اقتصادی خریدار", pattern: "(?:[0-9]{11}|[0-9]{14})", max: 14 },
  { key: "item_tax_id", label: "شناسه کالا یا خدمت", pattern: "[0-9]{13}", max: 13 },
  { key: "unit_code", label: "کد واحد اندازه‌گیری", pattern: "[0-9]{1,8}", max: 8 },
] as const;

function FiscalFields({ view }: { view: MoadianTransmissionController }) {
  return (
    <Form
      id="moadian-fiscal-form"
      fieldErrors={view.previewCommand.error?.fields}
      onSubmit={(event) => {
        event.preventDefault();
        void view.prepare();
      }}
    >
      <Field id="moadian-invoice" name="invoice_id" label="فاکتور فروش">
        <Select
          id="moadian-invoice"
          value={view.invoiceId}
          options={view.invoiceOptions}
          onValueChange={view.selectInvoice}
          disabled={view.working}
        />
      </Field>
      {view.invoice && <>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="moadian-issued-time"
            name="issued_at"
            label="ساعت صدور به وقت تهران"
            error={view.invalidClock ? "ساعت برای تاریخ صدور معتبر نیست." : undefined}
          >
            <Input
              id="moadian-issued-time"
              type="time"
              dir="ltr"
              required
              value={view.form.issued_time}
              onChange={(event) => view.change("issued_time", event.target.value)}
              disabled={view.working}
            />
          </Field>
          <Field id="moadian-buyer-type" name="buyer_type" label="نوع خریدار">
            <Select
              id="moadian-buyer-type"
              value={view.form.buyer_type}
              options={buyerOptions}
              onValueChange={(value) => view.change("buyer_type", value)}
              disabled={view.working}
            />
          </Field>
          {codeFields.map((field) => (
            <Field
              key={field.key}
              id={"moadian-" + field.key}
              name={field.key}
              label={field.label}
            >
              <Input
                id={"moadian-" + field.key}
                dir="ltr"
                inputMode={field.key === "tax_id" ? "text" : "numeric"}
                pattern={field.pattern}
                maxLength={field.max}
                required
                value={view.form[field.key]}
                onChange={(event) => view.change(field.key, asciiDigits(event.target.value).toUpperCase())}
                disabled={view.working}
              />
            </Field>
          ))}
        </div>
        <Field id="moadian-vat" name="vat_treatment" label="وضعیت ارزش افزوده">
          <Select
            id="moadian-vat"
            value={view.form.vat_treatment}
            options={vatOptions}
            onValueChange={(value) => view.change("vat_treatment", value)}
            disabled={view.working}
          />
        </Field>
        <Field id="moadian-vat-evidence" name="vat_evidence" label="مبنای معافیت یا نرخ صفر">
          <Textarea
            id="moadian-vat-evidence"
            value={view.form.vat_evidence}
            onChange={(event) => view.change("vat_evidence", event.target.value)}
            maxLength={300}
            required
            disabled={view.working}
          />
        </Field>
      </>}
      <FormMessage error>{view.previewCommand.error?.message}</FormMessage>
    </Form>
  );
}

function FiscalReview({ view }: { view: MoadianTransmissionController }) {
  const preview = view.review;
  if (!preview) return null;
  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2">
        <DetailField label="فاکتور فروش" value={preview.invoice_reference} />
        <DetailField label="نسخه فاکتور" value={persian(preview.invoice_version)} />
        <DetailField
          label="تاریخ و ساعت صدور"
          value={displayDate(preview.invoice_date) + " · " + persian(view.form.issued_time)}
        />
        <DetailField label="مبلغ (ریال)" value={amount(preview.amount)} />
        <DetailField label="شناسه یکتای مالیاتی" value={<bdi dir="ltr">{preview.tax_id}</bdi>} />
        <DetailField
          label="شماره اقتصادی فروشنده"
          value={<bdi dir="ltr">{preview.seller_tax_number}</bdi>}
        />
        <DetailField
          label="شماره اقتصادی خریدار"
          value={<bdi dir="ltr">{view.form.buyer_tax_number}</bdi>}
        />
        <DetailField
          label="نوع خریدار"
          value={buyerOptions.find((item) => item.value === view.form.buyer_type)?.label}
        />
        <DetailField label="شناسه کالا یا خدمت" value={<bdi dir="ltr">{view.form.item_tax_id}</bdi>} />
        <DetailField label="کد واحد اندازه‌گیری" value={<bdi dir="ltr">{view.form.unit_code}</bdi>} />
        <DetailField
          label="وضعیت ارزش افزوده"
          value={vatOptions.find((item) => item.value === view.form.vat_treatment)?.label}
        />
      </dl>
      <p className="break-words text-sm">{view.form.vat_evidence}</p>
      <FormMessage error>{view.submitCommand.error?.message}</FormMessage>
    </div>
  );
}

export function MoadianTransmissionForm({ view }: { view: MoadianTransmissionController }) {
  return (
    <Drawer
      title={view.review ? "بازبینی صورتحساب مؤدیان" : "آماده‌سازی صورتحساب مؤدیان"}
      open={view.open}
      onOpenChange={(open) => {
        if (!open) view.close();
      }}
      className="sm:max-w-2xl"
      footer={view.review ? (
        <>
          <Button variant="secondary" disabled={view.working} onClick={view.clearReview}>بازگشت به اطلاعات</Button>
          <Button
            busy={view.submitCommand.busy}
            disabled={!view.canSend}
            onClick={() => void view.submit()}
          >
            تأیید و ارسال به مؤدیان
          </Button>
        </>
      ) : (
        <Button
          form="moadian-fiscal-form"
          type="submit"
          disabled={!view.ready}
          busy={view.previewCommand.busy}
        >
          بازبینی صورتحساب
        </Button>
      )}
    >
      {view.review ? <FiscalReview view={view} /> :
        view.invoices.loading ? <LoadingState variant="message" label="در حال دریافت فاکتورهای فروش" /> :
          view.invoices.error ? <ErrorState message={view.invoices.error.message} onRetry={view.invoices.refresh} /> :
            !view.invoiceOptions.length ? (
              <EmptyState
                title="فاکتور فروش قابل ارسال موجود نیست"
                action={<ButtonLink href="/receivables" variant="secondary">فاکتورهای فروش</ButtonLink>}
              />
            ) : <FiscalFields view={view} />}
    </Drawer>
  );
}
