"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  LoadingState,
  ErrorState,
  StatusMessage,
} from "@/components/ui/content-states";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Hint } from "@/components/ui/tooltip";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Pagination } from "@/components/ui/pagination";
import { StatCards } from "@/components/ui/financial/stat-cards";
import { Drawer } from "@/components/ui/drawer";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";
import { useNativeInvoices } from "@/hooks/use-native-invoices";
import { useResource } from "@/hooks/use-resource";
import type { Proforma } from "@/lib/commercial";
import type { InvoiceDirection } from "@/lib/native-invoices";
import { nativeInvoiceReason, expectedDateLabel, invoiceHistoryDelayLabel } from "@/lib/native-invoices";
import { amount, displayDate, persian } from "@/lib/utils";
import { Panel } from "./page-parts";
import { ProformaConversion } from "./commercial/proforma-conversion";
import { NativeInvoiceTermsDialog } from "./native-invoice-terms-dialog";
import { NativeInvoiceAllocationDialog } from "./native-invoice-allocation-dialog";
import { NativeInvoiceReminderDialog } from "./native-invoice-reminder-dialog";
import { NativeInvoiceSourceDialog } from "./native-invoice-source-dialog";
import { NativeInvoiceDetail } from "./native-invoice-detail";
export function NativeInvoicesView({
  direction,
  followups = false,
  operationId,
  partyId,
  initialReference,
}: {
  direction: InvoiceDirection;
  followups?: boolean;
  operationId?: string;
  partyId?: string;
  initialReference?: string;
}) {
  const view = useNativeInvoices(direction, followups, operationId, partyId, initialReference);
  const [convertProformaOpen, setConvertProformaOpen] = useState(false);
  const [selectedProforma, setSelectedProforma] = useState<Proforma | null>(null);
  const proformasResource = useResource<{ items: Proforma[] }>(
    convertProformaOpen ? view.workspace.companyPath("commercial/proformas?limit=50") : null,
  );
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field id="native-invoice-asof" label="تاریخ برش (مانده تا تاریخ)">
            <PersianDatePicker
              id="native-invoice-asof"
              value={view.asOf}
              onChange={view.setAsOf}
            />
          </Field>
          <Badge tone="neutral" className="mb-2">
            مبنای مانده: دفتر بومی دیدبان
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {direction === "sale" && view.workspace.canWrite && (
            <Button
              variant="secondary"
              onClick={() => setConvertProformaOpen(true)}
            >
              تبدیل پیش‌فاکتور به فاکتور
            </Button>
          )}
          {view.preferredInvoice && (
            <Button
              variant="secondary"
              onClick={() => view.select(view.preferredInvoice!.id)}
            >
              مشاهده فاکتور {view.preferredInvoice.reference}
            </Button>
          )}
          {view.workspace.canWrite && (
            <Button onClick={() => view.openTerms()}>
              {view.preferredCandidate
                ? `ثبت فاکتور از سند ${view.preferredCandidate.reference}`
                : "ثبت فاکتور از سند حسابداری"}
            </Button>
          )}
        </div>
      </div>
      {followups && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field id="native-collection-priority" label="ترتیب پیگیری">
            <Select
              id="native-collection-priority"
              value={view.priority}
              onValueChange={(value) => {
                if (value === "amount" || value === "history")
                  view.setPriority(value);
              }}
              options={[
                { value: "amount", label: "مانده و تأخیر" },
                { value: "history", label: "سابقهٔ وصول مشتری" },
              ]}
            />
          </Field>
          {view.report.data?.priority_formula && (
            <Hint label="فرمول اولویت">
              {view.report.data.priority_formula}
            </Hint>
          )}
        </div>
      )}
      {view.report.loading ? (
        <LoadingState label="در حال دریافت فاکتورهای دفتر دیدبان" />
      ) : view.report.error ? (
        <ErrorState
          message={view.report.error.message}
        />
      ) : (
        <>
          {view.ledger.loading ? (
            <LoadingState label="در حال محاسبهٔ ماندهٔ دفتر" />
          ) : (
            <StatCards
              showComparison={false}
              metrics={view.metrics}
              items={[
                {
                  key: view.ledgerKey,
                  label:
                    direction === "sale"
                      ? "خالص مطالبات تجاری دفتر دیدبان"
                      : "خالص بدهی تجاری دفتر دیدبان",
                },
                {
                  key: direction === "sale" ? "ar_invoice" : "ap_invoice",
                  label:
                    direction === "sale"
                      ? "مانده فاکتورهای فروش"
                      : "مانده فاکتورهای خرید",
                },
              ]}
            />
          )}
          {view.ledger.error && (
            <StatusMessage>{view.ledger.error.message}</StatusMessage>
          )}
          <Panel
            title={
              direction === "sale"
                ? "فاکتورهای فروش دفتر دیدبان"
                : "فاکتورهای خرید دفتر دیدبان"
            }
            className="mt-5"
          >
              {followups &&
                view.priority === "history" &&
                view.report.data?.history_policy && (
                  <p className="my-3 text-xs text-muted">
                    وصول‌های{" "}
                    {displayDate(view.report.data.history_policy.window_start)} تا{" "}
                    {displayDate(view.report.data.history_policy.window_end)}
                  </p>
                )}
              <Table>
                <TableHeader sticky>
                  <TableRow>
                    <TableHead columnFilter={view.columnFilter("reference")}>شماره / مرجع</TableHead>
                    <TableHead columnFilter={view.columnFilter("date")}>تاریخ</TableHead>
                    <TableHead columnFilter={view.columnFilter("party")}>طرف حساب</TableHead>
                    <TableHead columnFilter={view.columnFilter("due")}>سررسید</TableHead>
                    <TableHead columnFilter={view.columnFilter("expected")}>وعدهٔ پرداخت</TableHead>
                    <TableHead numeric columnFilter={view.columnFilter("amount")}>مبلغ (ریال)</TableHead>
                    <TableHead numeric columnFilter={view.columnFilter("remaining")}>مانده (ریال)</TableHead>
                    <TableHead columnFilter={view.columnFilter("status")}>وضعیت</TableHead>
                    {followups && <TableHead columnFilter={view.columnFilter("delay")}>تأخیر تا تاریخ انتخابی</TableHead>}
                    {followups && view.priority === "history" && (
                      <TableHead columnFilter={view.columnFilter("history")}>سابقهٔ وصول ۱۸۰ روزه</TableHead>
                    )}
                    <TableHead>عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.rows.length ? (
                    view.rows.map((invoice) => {
                      const settled = invoice.status === "available" && invoice.remaining === "0";
                      const partyDisplay = invoice.party_name
                        ? `${invoice.party_name} (${invoice.party_id})`
                        : invoice.party_id;
                      return (
                      <TableRow key={invoice.id}>
                        <TableRowHeader>
                          <span dir="ltr">{invoice.reference}</span>
                        </TableRowHeader>
                        <TableCell className="whitespace-nowrap">
                          {displayDate(invoice.date)}
                        </TableCell>
                        <TableCell>{partyDisplay}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {invoice.terms?.due_date
                            ? displayDate(invoice.terms?.due_date)
                            : "نامشخص"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {invoice.terms?.expected_date
                            ? displayDate(invoice.terms.expected_date)
                            : expectedDateLabel(invoice.terms, invoice.direction)}
                        </TableCell>
                        <TableCell numeric className="whitespace-nowrap">
                          {amount(invoice.amount)}
                        </TableCell>
                        <TableCell numeric className="whitespace-nowrap">
                          {amount(invoice.remaining)}
                          {invoice.reason && (
                            <span className="block text-xs text-muted">
                              {nativeInvoiceReason(invoice.reason)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            tone={
                              invoice.status !== "available"
                                ? "warning"
                                : settled
                                  ? "success"
                                  : "primary"
                            }
                          >
                            {invoice.status !== "available"
                              ? "نامشخص"
                              : settled
                                ? "تسویه‌شده"
                                : "دارای مانده"}
                          </Badge>
                        </TableCell>
                        {followups && (
                          <TableCell>
                            {invoice.overdue_days == null ? (
                              <Badge tone="neutral">سررسید نامشخص</Badge>
                            ) : invoice.overdue_days > 0 ? (
                              <Badge tone="danger">{persian(invoice.overdue_days)} روز تأخیر</Badge>
                            ) : (
                              <Badge tone="success">بدون تأخیر</Badge>
                            )}
                          </TableCell>
                        )}
                        {followups && view.priority === "history" && (
                          <TableCell>
                            <span>
                              {persian(invoice.history_event_count || 0)} سند وصول
                              مستقل
                            </span>
                            <span className="mt-1 block text-xs text-muted">
                              {invoiceHistoryDelayLabel(invoice)}
                            </span>
                          </TableCell>
                        )}
                        <TableCell>
                          <TableRowActions label={`عملیات ${invoice.reference}`}>
                            <TableRowAction onClick={() => view.select(invoice.id)} kind="view">جزئیات و پیگیری</TableRowAction>
                          </TableRowActions>
                        </TableCell>
                      </TableRow>
                      );
                    })
                  ) : (
                    <TableEmptyCell
                      colSpan={
                        followups ? (view.priority === "history" ? 11 : 10) : 9
                      }
                      title={
                        view.filtersActive
                          ? "فاکتوری با این فیلتر پیدا نشد"
                          : "هنوز فاکتوری ثبت نشده است"
                      }
                    />
                  )}
                </TableBody>
              </Table>
              <Pagination
                page={view.currentPage}
                total={view.total}
                onPrevious={view.previous}
                onNext={view.next}
              />
            </Panel>
        </>
      )}

      <NativeInvoiceDetail view={view} />
      <NativeInvoiceSourceDialog view={view} />
      <NativeInvoiceReminderDialog view={view} />
      <NativeInvoiceTermsDialog view={view} />
      <NativeInvoiceAllocationDialog view={view} />

      <Drawer
        title="انتخاب پیش‌فاکتور جهت صدور فاکتور فروش"
        open={convertProformaOpen}
        onOpenChange={setConvertProformaOpen}
      >
        <div className="space-y-4">
          {proformasResource.loading ? (
            <LoadingState label="در حال دریافت پیش‌فاکتورها..." />
          ) : proformasResource.error ? (
            <ErrorState message={proformasResource.error.message} />
          ) : !proformasResource.data?.items?.length ? (
            <EmptyState title="پیش‌فاکتوری برای تبدیل یافت نشد" />
          ) : (
            <div className="space-y-2">
              {proformasResource.data.items
                .filter((p) => p.direction === "sale" && p.status !== "converted")
                .map((proforma) => (
                  <div
                    key={proforma.id}
                    className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-canvas"
                  >
                    <div>
                      <div className="font-medium text-foreground">
                        پیش‌فاکتور {proforma.number} · {proforma.party_id}
                      </div>
                      <div className="text-xs text-muted">
                        مبلغ: {amount(proforma.total_amount)} {proforma.currency === "TOMAN" ? "تومان" : "ریال"} · تاریخ: {displayDate(proforma.date)}
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setSelectedProforma(proforma);
                        setConvertProformaOpen(false);
                      }}
                    >
                      تبدیل به فاکتور
                    </Button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </Drawer>
      {selectedProforma && (
        <ProformaConversion
          row={selectedProforma}
          onClose={() => setSelectedProforma(null)}
          onComplete={() => {
            setSelectedProforma(null);
            view.report.refresh();
          }}
        />
      )}
    </>
  );
}
