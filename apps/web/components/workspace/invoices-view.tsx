"use client";
import { ReceiptIcon as HeaderIcon } from "@phosphor-icons/react";
import { Select } from "@/components/ui/select";
import { useInvoiceBasis } from "@/hooks/use-invoice-basis";
import { NativeInvoicesView } from "./native-invoices-view";
import { PageHeader } from "./page-parts";
import { DetailField } from "@/components/ui/field-layout";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field } from "@/components/ui/field";
import { StatCards } from "@/components/ui/financial/stat-cards";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { useInvoiceView } from "@/hooks/use-financial-view";
import type { InvoiceDetail } from "@/lib/api";
import { amount, displayDate } from "@/lib/utils";
import {
  ArrowUpLeftIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  ReceiptIcon,
  UserIcon,
  CalendarBlankIcon,
  CoinsIcon,
  WalletIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import {
  NoCompany,
  NoResult,
  Panel,
  PeriodFilter,
} from "./page-parts";

const detailIcons: Record<string, Icon> = {
  "شماره فاکتور": ReceiptIcon,
  "طرف حساب": UserIcon,
  "تاریخ صدور": CalendarBlankIcon,
  سررسید: CalendarBlankIcon,
  "مبلغ فاکتور": CoinsIcon,
  مانده: WalletIcon,
};
function ImportedInvoicesWorkspace({
  direction,
}: {
  direction: "sales" | "purchases";
}) {
  const view = useInvoiceView(direction);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<InvoiceDetail | null>(null);
  const receivable = direction === "sales";
  const unit = view.workspace.unit;
  if (!view.workspace.company) return <NoCompany />;
  return (
    <>
      <PeriodFilter />
      {view.loading ? (
        <LoadingState />
      ) : view.error ? (
        <ErrorState message={view.error.message} onRetry={view.refresh} />
      ) : !view.manifest ? (
        <NoResult />
      ) : (
        <>
          <StatCards
            metrics={view.manifest.metrics}
            items={
              receivable
                ? [
                    { key: "ar_ledger", label: "مطالبات تجاری دفتر" },
                    { key: "ar_invoice", label: "مانده فاکتورهای فروش" },
                    { key: "ar_difference", label: "اختلاف قابل مقایسه" },
                  ]
                : [
                    { key: "ap_trade_ledger", label: "بدهی تجاری دفتر" },
                    { key: "ap_invoice", label: "مانده فاکتورهای خرید" },
                    { key: "ap_difference", label: "اختلاف قابل مقایسه" },
                  ]
            }
          />
          {!receivable && view.metrics.debt_total_ledger && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
              <span className="text-muted">کل بدهی دفتر</span>
              <span className="tabular-nums">
                {amount(view.metrics.debt_total_ledger.value, unit)}{" "}
                {unit === "IRR" ? "ریال" : "تومان"}
              </span>
            </div>
          )}
          <Panel
            title={receivable ? "فاکتورهای فروش" : "فاکتورهای خرید"}
            className="mt-5"
          >
            <div className="mb-5 flex flex-wrap items-end gap-3">
              <Field
                id="invoice-query"
                label="جستجوی فاکتور یا طرف حساب"
                icon={MagnifyingGlassIcon}
              >
                <Input
                  id="invoice-query"
                  ref={searchRef}
                  value={view.query}
                  onChange={(event) => view.setQuery(event.target.value)}
                  className="sm:w-72"
                />
              </Field>
              <Button
                variant={view.overdue ? "soft" : "secondary"}
                aria-pressed={view.overdue}
                onClick={() => view.setOverdue(!view.overdue)}
              >
                {view.overdue && <CheckIcon size={16} />}سررسیدگذشته
              </Button>
              {(view.query || view.overdue) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    view.setQuery("");
                    view.setOverdue(false);
                    searchRef.current?.focus();
                  }}
                >
                  پاک‌کردن فیلتر
                </Button>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>فاکتور</TableHead>
                  <TableHead>طرف حساب</TableHead>
                  <TableHead>سررسید</TableHead>
                  <TableHead>
                    مانده ({unit === "IRR" ? "ریال" : "تومان"})
                  </TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>
                    <span className="sr-only">جزئیات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.length ? (
                  view.rows.map((invoice) => (
                    <TableRow key={invoice.id || invoice.reference}>
                      <TableRowHeader>
                        <span dir="ltr">{invoice.reference}</span>
                      </TableRowHeader>
                      <TableCell>{invoice.party_id}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {invoice.due_date
                          ? displayDate(invoice.due_date)
                          : "موعد نامشخص"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {amount(invoice.remaining, unit)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={invoice.financialState} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          className="size-11 p-0"
                          aria-label={`جزئیات فاکتور ${invoice.reference}`}
                          onClick={() => setSelected(invoice)}
                        >
                          <ArrowUpLeftIcon size={18} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell
                    colSpan={6}
                    title={
                      view.query || view.overdue
                        ? "فاکتوری با این فیلتر پیدا نشد"
                        : "فاکتوری در این نسخه موجود نیست"
                    }
                  />
                )}
              </TableBody>
            </Table>
            <Pagination
              page={view.page}
              total={view.total}
              onPrevious={view.previousPage}
              onNext={view.nextPage}
            />
          </Panel>
        </>
      )}
      <Drawer
        title="جزئیات فاکتور"
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected && (
          <dl className="space-y-4">
            {[
              ["شماره فاکتور", selected.reference],
              ["طرف حساب", selected.party_id],
              ["تاریخ صدور", displayDate(selected.date)],
              ["سررسید", displayDate(selected.due_date)],
              [
                "مبلغ فاکتور",
                `${amount(selected.amount, unit)} ${unit === "IRR" ? "ریال" : "تومان"}`,
              ],
              [
                "مانده",
                `${amount(selected.remaining, unit)} ${unit === "IRR" ? "ریال" : "تومان"}`,
              ],
            ].map(([label, value]) => (
              <DetailField
                key={label}
                label={label}
                value={value}
                icon={detailIcons[label]}
              />
            ))}
            {selected.reason && (
              <StatusMessage>{selected.reason}</StatusMessage>
            )}
          </dl>
        )}
      </Drawer>
    </>
  );
}

export function InvoicesView({direction}:{direction:"sales"|"purchases"}) {
  const view=useInvoiceBasis();
  if(!view.workspace.company)return <NoCompany/>;
  return <><PageHeader icon={HeaderIcon} title={direction==="sales"?"مطالبات":"بدهی‌ها"} action={direction==="sales"&&<ButtonLink href="/receivables/followups" variant="secondary">پیگیری وصول</ButtonLink>}/>
    <div className="mb-5"><Field id="invoice-data-basis" label="مبنای فاکتورها"><Select id="invoice-data-basis" value={view.basis} onValueChange={view.select} options={[{value:"native_invoice",label:"فاکتور خدمات دفتر دیدبان"},{value:"imported_invoice",label:"فاکتور واردشده از فایل"}]}/></Field></div>
    {view.setup.loading?<LoadingState/>:view.setup.error?<ErrorState message={view.setup.error.message} onRetry={view.setup.refresh}/>:view.basis==="native_invoice"?<NativeInvoicesView key={`${view.scope}:${direction}`} direction={direction==="sales"?"sale":"purchase"}/>:<ImportedInvoicesWorkspace key={`${view.scope}:${direction}`} direction={direction}/>}
  </>;
}
