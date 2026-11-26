"use client";
import { ArrowsLeftRightIcon as HeaderIcon } from "@phosphor-icons/react";
import { SearchSelect } from "@/components/ui/search-select";
import { useAllocationChoices } from "@/hooks/use-allocation-choices";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Form } from "@/components/ui/form";
import { AmountInput, Textarea } from "@/components/ui/input";
import { CursorPagination } from "@/components/ui/pagination";
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
import { useCommand } from "@/hooks/use-command";
import { usePagedResource } from "@/hooks/use-paged-resource";
import { useWorkspace } from "@/hooks/workspace";
import { listItems, type Allocation } from "@/lib/api";
import { amount, persian, cn } from "@/lib/utils";
import { SearchInput } from "@/components/ui/search-input";
import {
  ArrowCounterClockwiseIcon,
  CheckCircleIcon,
  CurrencyCircleDollarIcon,
  PlusIcon,
  TextAaIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { TreasuryDocumentsPanel } from "./treasury-documents-panel";
import { CounterpartyQuickDrawer } from "./commercial/counterparty-profile-drawer";

export function SettlementsView() {
  const workspace = useWorkspace();
  const allocations = usePagedResource<Allocation>(
    workspace.companyPath("allocations"),
  );
  const [operationType, setOperationType] = useState<"received" | "paid">("received");
  const choices = useAllocationChoices(operationType);
  const { banks, invoices } = choices;
  const command = useCommand();
  const [open, setOpen] = useState(false);
  const [reversing, setReversing] = useState<Allocation | null>(null);
  const [bankId, setBankId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"all" | "received" | "paid">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "reversed">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [settlementTab, setSettlementTab] = useState<"allocations" | "treasury">("allocations");
  const [counterpartiesOpen, setCounterpartiesOpen] = useState(false);

  if (!workspace.company) return <NoCompany />;

  const allAllocations = listItems(allocations.data);
  const activeAllocations = allAllocations.filter((a) => !a.reversed_at);
  const reversedAllocations = allAllocations.filter((a) => !!a.reversed_at);
  const activeTotalAmount = activeAllocations.reduce((sum, a) => sum + Number(a.amount || 0), 0);

  const filteredAllocations = allAllocations.filter((allocation) => {
    if (statusFilter === "active" && allocation.reversed_at) return false;
    if (statusFilter === "reversed" && !allocation.reversed_at) return false;
    const inv = listItems(invoices.data).find((i) => i.id === allocation.invoice_id);
    const bank = listItems(banks.data).find((b) => b.id === allocation.bank_id);
    const isReceived = (bank && Number(bank.amount) > 0) || (inv && (inv.direction === "sales" || Number(inv.amount) > 0));
    if (directionFilter === "received" && !isReceived) return false;
    if (directionFilter === "paid" && isReceived) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const invRef = (
        allocation.invoice_reference ||
        inv?.reference ||
        allocation.invoice_id
      ).toLowerCase();
      const bankRef = (
        allocation.bank_reference ||
        bank?.reference ||
        allocation.bank_id
      ).toLowerCase();
      if (!invRef.includes(q) && !bankRef.includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="دریافت و پرداخت"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setCounterpartiesOpen(true)}>
              طرف‌حساب‌ها
            </Button>
            <ButtonLink variant="secondary" href="/settings/treasury">
              مدیریت حساب‌های خزانه
            </ButtonLink>
            {workspace.canWrite && settlementTab === "allocations" && (
              <Button
                onClick={() => {
                  setOpen(true);
                  command.clearError();
                }}
              >
                تخصیص دریافت و پرداخت
                <PlusIcon size={16} aria-hidden />
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-5 space-y-3">
        <Tabs
          variant="segmented"
          ariaLabel="بخش‌های دریافت و پرداخت"
          value={settlementTab}
          onChange={setSettlementTab}
          items={[
            { id: "allocations", label: "تخصیص‌های بانک و فاکتور" },
            { id: "treasury", label: "سندهای خزانه و ابزارهای تسویه" },
          ]}
        />
        <StatusMessage tone="primary">
          {settlementTab === "allocations"
            ? "در «تخصیص‌های بانک و فاکتور»، گردش‌های واقعی بانک را مستقیماً به ماندهٔ فاکتورهای باز وصل می‌کنید."
            : "در «سندهای خزانه و ابزارهای تسویه»، دریافت یا پرداخت چندابزاری (نقد، حواله، کارت و چک) با پیوند به حساب‌های خزانه، پیش‌نویس سند و تخصیص فاکتور مدیریت می‌شود."}
        </StatusMessage>
      </div>

      {settlementTab === "treasury" ? (
        <TreasuryDocumentsPanel />
      ) : (
        <>

      {/* Summary KPI Cards */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-muted">
            <CheckCircleIcon size={18} className="text-success" />
            <span>تخصیص‌های فعال</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-xl font-medium tabular-nums text-foreground">
              {persian(activeAllocations.length)}
            </span>
            <span className="text-xs text-muted">فقره</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-muted">
            <WalletIcon size={18} className="text-primary" />
            <span>مجموع مبالغ تخصیص‌یافته</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-xl font-medium tabular-nums text-foreground">
              {amount(String(activeTotalAmount), workspace.unit)}
            </span>
            <span className="text-xs text-muted">
              {workspace.unit === "IRR" ? "ریال" : "تومان"}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-muted">
            <ArrowCounterClockwiseIcon size={18} className="text-warning" />
            <span>تخصیص‌های برگشت‌شده</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-xl font-medium tabular-nums text-foreground">
              {persian(reversedAllocations.length)}
            </span>
            <span className="text-xs text-muted">فقره</span>
          </div>
        </div>
      </div>

      <Panel title="ارتباط پرداخت و فاکتور">
        {/* Filter and Search Bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              label="جستجو در فاکتور یا مرجع بانک"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-60 text-xs"
            />
            <div className="inline-flex rounded-control border border-border/80 bg-canvas/60 p-0.5 text-xs">
              {(
                [
                  { key: "all", label: "همه تراکنش‌ها" },
                  { key: "received", label: "دریافت‌ها" },
                  { key: "paid", label: "پرداخت‌ها" },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setDirectionFilter(f.key)}
                  className={cn(
                    "rounded px-3 py-1 text-xs transition-colors",
                    directionFilter === f.key
                      ? "bg-surface text-primary font-medium shadow-xs"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-control border border-border/80 bg-canvas/60 p-0.5 text-xs">
              {(
                [
                  { key: "all", label: "همه وضعیت‌ها" },
                  { key: "active", label: "فعال" },
                  { key: "reversed", label: "برگشت‌شده" },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setStatusFilter(f.key)}
                  className={cn(
                    "rounded px-3 py-1 text-xs transition-colors",
                    statusFilter === f.key
                      ? "bg-surface text-primary font-medium shadow-xs"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {allocations.loading ? (
          <LoadingState variant="table" label="در حال دریافت تخصیص‌ها" />
        ) : allocations.error ? (
          <ErrorState
            message={allocations.error.message}
            onRetry={allocations.refresh}
          />
        ) : (
          <>
            <Table>
              <TableHeader sticky>
                <TableRow>
                  <TableHead>فاکتور</TableHead>
                  <TableHead>مرجع بانکی</TableHead>
                  <TableHead numeric>
                    مبلغ ({workspace.unit === "IRR" ? "ریال" : "تومان"})
                  </TableHead>
                  <TableHead className="w-28">وضعیت</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">برگشت تخصیص</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAllocations.length ? (
                  filteredAllocations.map((allocation) => {
                    const inv = listItems(invoices.data).find((i) => i.id === allocation.invoice_id);
                    const isSales = inv ? inv.direction === "sales" || Number(inv.amount || 0) > 0 : true;
                    return (
                    <TableRow key={allocation.id}>
                      <TableRowHeader>
                        <ButtonLink
                          variant="ghost"
                          className="h-auto px-1 py-0.5 font-medium text-foreground"
                          href={isSales ? "/receivables" : "/payables"}
                        >
                          {allocation.invoice_reference || inv?.reference || allocation.invoice_id}
                        </ButtonLink>
                      </TableRowHeader>
                      <TableCell>
                        {allocation.bank_reference ||
                          listItems(banks.data).find(
                            (bank) => bank.id === allocation.bank_id,
                          )?.reference ||
                          allocation.bank_id}
                      </TableCell>
                      <TableCell numeric className="whitespace-nowrap">
                        {amount(allocation.amount, workspace.unit)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          tone={allocation.reversed_at ? "neutral" : "success"}
                        >
                          {allocation.reversed_at ? "برگشت‌شده" : "فعال"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {workspace.canWrite && !allocation.reversed_at && (
                          <Button
                            variant="ghost"
                            className="h-8 text-xs text-danger hover:bg-danger-soft"
                            onClick={() => {
                              setReversing(allocation);
                              setReason("");
                              command.clearError();
                            }}
                          >
                            <ArrowCounterClockwiseIcon size={16} />
                            برگشت
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })
                ) : (
                  <TableEmptyCell
                    colSpan={5}
                    title={
                      searchQuery || statusFilter !== "all"
                        ? "تخصیصی با این فیلتر یا جستجو پیدا نشد"
                        : "هنوز دریافت یا پرداختی ثبت نشده است"
                    }
                    action={
                      searchQuery || statusFilter !== "all" ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setSearchQuery("");
                            setStatusFilter("all");
                          }}
                        >
                          پاک‌کردن فیلترها
                        </Button>
                      ) : workspace.canWrite ? (
                        <Button
                          onClick={() => {
                            setOpen(true);
                            command.clearError();
                          }}
                        >
                          ثبت اولین تخصیص
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...allocations} />
          </>
        )}
      </Panel>
      <Drawer title="تخصیص دریافت و پرداخت به فاکتور" open={open} onOpenChange={setOpen}>
        <Form
          fieldErrors={command.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            void command.run(
              workspace.companyPath("allocations"),
              {
                body: { bank_id: bankId, invoice_id: invoiceId, amount: value },
              },
              () => {
                setOpen(false);
                setValue("");
                allocations.refresh();
              },
              "تخصیص ثبت شد.",
            );
          }}
        >
          <Field id="allocation-direction" label="نوع عملیات" required>
            <Select
              id="allocation-direction"
              value={operationType}
              onValueChange={(val) => {
                setOperationType(val as "received" | "paid");
                setBankId("");
                choices.setBankLabel("");
                setInvoiceId("");
                choices.setInvoiceLabel("");
              }}
              options={[
                { value: "received", label: "دریافت (از مشتری / فاکتور فروش)" },
                { value: "paid", label: "پرداخت (به تأمین‌کننده / فاکتور خرید)" },
              ]}
            />
          </Field>
          <Field name="bank_id" id="allocation-bank" label="گردش بانک" required>
            <SearchSelect
              id="allocation-bank"
              value={bankId}
              selectedLabel={choices.bankLabel}
              onValueChange={(value, label) => {
                setBankId(value);
                choices.setBankLabel(label);
              }}
              query={choices.bankQuery}
              onQueryChange={choices.setBankQuery}
              options={choices.bankOptions}
              loading={choices.bankLoading}
              error={banks.error?.message}
              hasMore={!!banks.data?.next_cursor}
              searchLabel="جستجوی مرجع یا حساب بانک"
            />
          </Field>
          <Field name="invoice_id" id="allocation-invoice" label="فاکتور" required>
            <SearchSelect
              id="allocation-invoice"
              value={invoiceId}
              selectedLabel={choices.invoiceLabel}
              onValueChange={(value, label) => {
                setInvoiceId(value);
                choices.setInvoiceLabel(label);
              }}
              query={choices.invoiceQuery}
              onQueryChange={choices.setInvoiceQuery}
              options={choices.invoiceOptions}
              loading={choices.invoiceLoading}
              error={invoices.error?.message}
              hasMore={!!invoices.data?.next_cursor}
              searchLabel="جستجوی شماره فاکتور یا طرف حساب"
            />
          </Field>
          <Field
            id="allocation-amount"
            label="مبلغ تخصیص (ریال)"
            icon={CurrencyCircleDollarIcon}
          >
            <AmountInput
              id="allocation-amount"
              required
              value={value}
              onValueChange={setValue}
            />
          </Field>
          <FormMessage error>{command.error?.message}</FormMessage>
          <Button
            type="submit"
            busy={command.busy}
            disabled={!bankId || !invoiceId}
          >
            ثبت تخصیص
          </Button>
        </Form>
      </Drawer>
      <Dialog
        title="برگشت تخصیص"
        open={!!reversing}
        onOpenChange={(open) => {
          if (!open) setReversing(null);
        }}
      >
        <Form
          fieldErrors={command.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            if (reversing)
              void command.run(
                workspace.companyPath(`allocations/${reversing.id}/reversals`),
                {
                  body: {
                    reason: reason.trim(),
                    expected_version: reversing.version,
                  },
                  version: reversing.version,
                },
                () => {
                  setReversing(null);
                  allocations.refresh();
                },
                "برگشت ثبت شد.",
              );
          }}
        >
          <Field id="reversal-reason" label="دلیل برگشت" icon={TextAaIcon}>
            <Textarea
              id="reversal-reason"
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <FormMessage error>{command.error?.message}</FormMessage>
          <Button type="submit" variant="danger" busy={command.busy}>
            ثبت برگشت
          </Button>
        </Form>
      </Dialog>
        </>
      )}
      <CounterpartyQuickDrawer
        open={counterpartiesOpen}
        onOpenChange={setCounterpartiesOpen}
      />
    </>
  );
}
