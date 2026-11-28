import type { useCommercialDocuments } from "@/hooks/use-commercial-documents";
import { ErrorState } from "@/components/ui/content-states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AmountInput, Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import { moduleAllows } from "@/lib/module-access";
import { listItems } from "@/lib/api";
import { CommercialDocumentLines } from "./commercial-document-lines";

export function CommercialDocumentDetails({ view }: { view: ReturnType<typeof useCommercialDocuments> }) {
  const {
    workspace,
    counterparties,
    inventory,
    setPartyQuickCreateOpen,
    setViewingParty,
    issueDate,
    setIssueDate,
    partyId,
    setPartyId,
    setWarehouseId,
    invoiceDiscount,
    setInvoiceDiscount,
    docDesc,
    setDocDesc,
    cpOptions,
    whOptions,
    effectiveWarehouseId,
    totals,
    clearClientError,
  } = view;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          {counterparties.error && <ErrorState message={counterparties.error.message} onRetry={counterparties.refresh} />}
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
              disabled={counterparties.loading}
              placeholder={counterparties.loading ? "در حال دریافت طرف‌حساب‌ها…" : "انتخاب طرف‌حساب"}
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
            {moduleAllows(workspace.company, "commercial", "create", workspace.canWrite) && (
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
          <Field id="cd-wh" name="warehouse_id" label="انبار" required>
            <Select
              id="cd-wh"
              disabled={inventory.loading}
              placeholder={inventory.loading ? "در حال دریافت انبارها…" : "انتخاب انبار"}
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
            label="تاریخ صدور"
            value={issueDate}
            onChange={(v) => {
              setIssueDate(v);
              clearClientError("issue_date", "due_date");
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
      </div>

      <Field id="cd-desc" name="description" label="شرح سند">
        <Input id="cd-desc" value={docDesc} onChange={(e) => setDocDesc(e.target.value)} />
      </Field>
      {totals.hasGoods && inventory.error && <ErrorState message={inventory.error.message} onRetry={inventory.refresh} />}
      <CommercialDocumentLines view={view} />
    </>
  );
}
