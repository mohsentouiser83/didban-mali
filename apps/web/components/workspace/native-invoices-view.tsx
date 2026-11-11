"use client";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  LoadingState,
  ErrorState,
  StatusMessage,
} from "@/components/ui/content-states";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Hint } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Pagination, CursorPagination } from "@/components/ui/pagination";
import { StatCards } from "@/components/ui/financial/stat-cards";
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
import type { InvoiceDirection } from "@/lib/native-invoices";
import { nativeInvoiceReason, expectedDateLabel } from "@/lib/native-invoices";
import { amount, displayDate, persian } from "@/lib/utils";
import { Panel, PeriodFilter } from "./page-parts";
import { NativeInvoiceTermsDialog } from "./native-invoice-terms-dialog";
import { NativeInvoiceAllocationDialog } from "./native-invoice-allocation-dialog";
import { NativeInvoiceReminderDialog } from "./native-invoice-reminder-dialog";
import { NativeInvoiceSnapshot } from "./native-invoice-snapshot";
import { NativeInvoiceSourceDialog } from "./native-invoice-source-dialog";
import { NativeInvoiceDetail } from "./native-invoice-detail";
export function NativeInvoicesView({
  direction,
  followups = false,
  operationId,
}: {
  direction: InvoiceDirection;
  followups?: boolean;
  operationId?: string;
}) {
  const view = useNativeInvoices(direction, followups, operationId);
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <Field id="native-invoice-asof" label="مانده تا تاریخ">
          <PersianDatePicker
            id="native-invoice-asof"
            value={view.asOf}
            onChange={view.setAsOf}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
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
                ? `تکمیل شرایط فاکتور ${view.preferredCandidate.reference}`
                : "تکمیل شرایط فاکتور"}
            </Button>
          )}
        </div>
      </div>
      <PeriodFilter />
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
          onRetry={view.report.refresh}
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
            title="فاکتورهای دفتر دیدبان"
            className="mt-5"
            action={
              <ButtonLink href="/accounting" variant="secondary">
                اسناد حسابداری
              </ButtonLink>
            }
          >
            <Field id="native-invoice-query" label="فاکتور یا طرف حساب">
              <Input
                id="native-invoice-query"
                value={view.query}
                onChange={(event) => view.setQuery(event.target.value)}
              />
            </Field>
            {followups &&
              view.priority === "history" &&
              view.report.data?.history_policy && (
                <p className="my-3 text-xs text-muted">
                  وصول‌های{" "}
                  {displayDate(view.report.data.history_policy.window_start)} تا{" "}
                  {displayDate(view.report.data.history_policy.window_end)}؛
                  شواهد آینده کنار گذاشته شده‌اند.
                </p>
              )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>مرجع</TableHead>
                  <TableHead>طرف حساب</TableHead>
                  <TableHead>سررسید</TableHead>
                  <TableHead>وعدهٔ پرداخت</TableHead>
                  <TableHead>مانده (ریال)</TableHead>
                  {followups && <TableHead>تأخیر تا تاریخ انتخابی</TableHead>}
                  {followups && view.priority === "history" && (
                    <TableHead>سابقهٔ وصول ۱۸۰ روزه</TableHead>
                  )}
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.length ? (
                  view.rows.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableRowHeader>{invoice.reference}</TableRowHeader>
                      <TableCell>{invoice.party_id}</TableCell>
                      <TableCell>
                        {invoice.terms?.due_date
                          ? displayDate(invoice.terms?.due_date)
                          : "نامشخص"}
                      </TableCell>
                      <TableCell>
                        {invoice.terms?.expected_date
                          ? displayDate(invoice.terms.expected_date)
                          : expectedDateLabel(invoice.terms, invoice.direction)}
                      </TableCell>
                      <TableCell>
                        {amount(invoice.remaining)}
                        {invoice.reason && (
                          <span className="block text-xs text-muted">
                            {nativeInvoiceReason(invoice.reason)}
                          </span>
                        )}
                      </TableCell>
                      {followups && (
                        <TableCell>
                          {invoice.overdue_days == null
                            ? "سررسید نامشخص"
                            : invoice.overdue_days
                              ? `${persian(invoice.overdue_days)} روز`
                              : "بدون تأخیر"}
                        </TableCell>
                      )}
                      {followups && view.priority === "history" && (
                        <TableCell>
                          <span>
                            {persian(invoice.history_event_count || 0)} سند وصول
                            مستقل
                          </span>
                          <span className="mt-1 block text-xs text-muted">
                            {invoice.history_lag_days == null
                              ? invoice.history_reason ===
                                "receipt_history_ambiguous"
                                ? "تاریخ‌های وصول یا سررسید یک سند ناسازگار است."
                                : "کمتر از ۳ وصول معتبر؛ تأخیر معمول قابل محاسبه نیست."
                              : `میانهٔ وزنی با مبلغ: ${persian(invoice.history_lag_days)} روز`}
                          </span>
                        </TableCell>
                      )}
                      <TableCell>
                        <Button
                          variant="secondary"
                          onClick={() => view.select(invoice.id)}
                        >
                          جزئیات و پیگیری
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell
                    colSpan={
                      followups ? (view.priority === "history" ? 8 : 7) : 6
                    }
                    title={
                      view.query
                        ? "فاکتوری با این فیلتر پیدا نشد"
                        : "فاکتور خدماتی تکمیل نشده"
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
      <Panel
        title="نسخه‌های ثابت فاکتورها"
        className="mt-5"
        action={
          view.workspace.canWrite && (
            <Button
              variant="secondary"
              onClick={view.saveSnapshot}
              busy={view.command.busy}
            >
              ذخیرهٔ نسخه تا تاریخ انتخابی
            </Button>
          )
        }
      >
        {view.snapshots.loading ? (
          <LoadingState label="در حال دریافت نسخه‌های ثابت" />
        ) : view.snapshots.error ? (
          <ErrorState
            message={view.snapshots.error.message}
            onRetry={view.snapshots.refresh}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>تاریخ مبنا</TableHead>
                <TableHead>زمان ذخیره</TableHead>
                <TableHead>مبنا</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.snapshots.data?.items.length ? (
                view.snapshots.data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableRowHeader>
                      {displayDate(item.payload.as_of)}
                    </TableRowHeader>
                    <TableCell>{displayDate(item.created_at)}</TableCell>
                    <TableCell>
                      <Badge>
                        {item.payload.direction === "sale"
                          ? "فروش خدمات"
                          : item.payload.direction === "purchase"
                            ? "خرید خدمات"
                            : "فروش و خرید خدمات"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        onClick={() => view.selectSnapshot(item.id)}
                      >
                        مشاهدهٔ نسخه
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell colSpan={4} title="نسخهٔ ثابتی ذخیره نشده" />
              )}
            </TableBody>
          </Table>
        )}
        <CursorPagination {...view.snapshots} />
        <FormMessage error>
          {!view.editor &&
            !view.allocation &&
            !view.sourceRevision &&
            view.command.error?.message}
        </FormMessage>
      </Panel>
      <NativeInvoiceDetail view={view} />
      <NativeInvoiceSourceDialog view={view} />
      <NativeInvoiceSnapshot view={view} />
      <NativeInvoiceReminderDialog view={view} />
      <NativeInvoiceTermsDialog view={view} />
      <NativeInvoiceAllocationDialog view={view} />
    </>
  );
}
