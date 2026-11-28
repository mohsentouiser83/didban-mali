"use client";

import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { ArrowsLeftRightIcon, ArrowCounterClockwiseIcon, CurrencyCircleDollarIcon, PlusIcon, TextAaIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColumnFilteredTable, type ListColumn } from "@/components/ui/column-filtered-table";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Textarea } from "@/components/ui/input";
import { SearchSelect } from "@/components/ui/search-select";
import { Select } from "@/components/ui/select";
import { TableCell, TableRow, TableRowHeader } from "@/components/ui/table";
import { useAllocationChoices } from "@/hooks/use-allocation-choices";
import { useSettlementList, type SettlementRow } from "@/hooks/use-settlement-list";
import type { Allocation } from "@/lib/api";
import { useCommand } from "@/hooks/use-command";
import { useWorkspace } from "@/hooks/workspace";
import { moduleAllows } from "@/lib/module-access";
import { amount, displayDate } from "@/lib/utils";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { TreasuryDocumentTable } from "./treasury-document-table";
import { TreasuryDocumentDialogs } from "./treasury-documents-panel";

export function SettlementsView() {
  const { company, user } = useWorkspace();
  return company ? <SettlementList key={`${user?.id}:${company.id}`} /> : <NoCompany />;
}

function SettlementList() {
  const workspace = useWorkspace();
  const canViewAllocations = moduleAllows(workspace.company, "cashflow", "view");
  const canCreateAllocation = canViewAllocations && moduleAllows(workspace.company, "cashflow", "create", workspace.canWrite);
  const canReverseAllocation = canViewAllocations && moduleAllows(workspace.company, "cashflow", "delete", workspace.canWrite);
  const { allocations, treasury, rows } = useSettlementList(canViewAllocations);
  const [operationType, setOperationType] = useState<"received" | "paid">("received");
  const command = useCommand();
  const [open, setOpen] = useState(false);
  const choices = useAllocationChoices(operationType, canCreateAllocation && open);
  const { banks, invoices } = choices;
  const [reversing, setReversing] = useState<Allocation | null>(null);
  const [bankId, setBankId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [treasuryId, setTreasuryId] = useState<string | null>(null);
  const shownTreasury = treasury.docRows.filter(({ doc }) => doc.id === treasuryId);
  const columns: ListColumn<SettlementRow>[] = [
    { label: "شماره / مرجع", value: (row) => row.reference },
    { label: "نوع", value: (row) => row.kind },
    { label: "تاریخ", value: (row) => displayDate(row.date) },
    { label: "طرف‌حساب", value: (row) => row.counterparty },
    { label: "مرجع بانکی", value: (row) => row.bankReference },
    { label: `مبلغ (${workspace.unit === "IRR" ? "ریال" : "تومان"})`, numeric: true, value: (row) => amount(row.amount, workspace.unit) },
    { label: "وضعیت", value: (row) => row.status },
    { label: "عملیات", srOnly: true },
  ];
  const resources = [allocations, treasury.docs];

  return (
    <>
      <PageHeader icon={ArrowsLeftRightIcon} title="دریافت و پرداخت" action={
        <div className="flex flex-wrap gap-2">
          {treasury.canCreate && (
            <Button onClick={() => {
              treasury.cmd.clearError();
              treasury.setCreateClientError("");
              treasury.setCreateOpen(true);
            }}>
              <PlusIcon size={18} aria-hidden />سند خزانه جدید
            </Button>
          )}
          {canCreateAllocation && (
            <Button variant="secondary" onClick={() => {
              command.clearError();
              setOpen(true);
            }}>تخصیص دریافت و پرداخت</Button>
          )}
        </div>
      } />
      <Panel>
        {resources.map((resource, index) => resource.error && (
          <ErrorState key={index} message={resource.error.message} onRetry={resource.refresh} />
        ))}
        {resources.some((resource) => resource.loading) ? (
          <LoadingState label="در حال دریافت اسناد دریافت و پرداخت" variant="table" />
        ) : (
          <ColumnFilteredTable
            label="دریافت و پرداخت"
            columns={columns}
            rows={rows}
            emptyTitle="هنوز دریافت یا پرداختی ثبت نشده است"
            renderRow={(row) => {
              const { source } = row;
              return (
                <TableRow key={row.id}>
                  <TableRowHeader><bdi>{row.reference}</bdi></TableRowHeader>
                  <TableCell>{row.kind}</TableCell>
                  <TableCell className="whitespace-nowrap">{displayDate(row.date)}</TableCell>
                  <TableCell>{row.counterparty}</TableCell>
                  <TableCell><bdi>{row.bankReference}</bdi></TableCell>
                  <TableCell numeric className="whitespace-nowrap">{amount(row.amount, workspace.unit)}</TableCell>
                  <TableCell><Badge>{row.status}</Badge></TableCell>
                  <TableCell>
                    <TableRowActions label={`عملیات ${row.reference}`}>
                      {source.kind === "treasury" ? (
                      <TableRowAction onClick={() => setTreasuryId(source.row.doc.id)} kind="view">جزئیات</TableRowAction>
                    ) : canReverseAllocation && !source.allocation.reversed_at && (
                      <TableRowAction
                        onClick={() => {
                            setReversing(source.allocation);
                            setReason("");
                            command.clearError();
                        }}
                        icon={<ArrowCounterClockwiseIcon size={16} aria-hidden />}
                        danger
                      >
                        برگشت
                      </TableRowAction>
                    )}
                    </TableRowActions>
                  </TableCell>
                </TableRow>
              );
            }}
          />
        )}
      </Panel>
      <Drawer title="جزئیات سند خزانه" open={!!treasuryId} onOpenChange={(open) => !open && setTreasuryId(null)} className="sm:max-w-4xl">
        <TreasuryDocumentTable view={{ ...treasury, docRows: shownTreasury }} hideJournalLink />
      </Drawer>
      <TreasuryDocumentDialogs view={treasury} showNavigation={false} />
      <Drawer title="تخصیص دریافت و پرداخت به فاکتور" open={open} onOpenChange={setOpen}>
        <Form
          fieldErrors={command.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            void command.run(
              canViewAllocations ? workspace.companyPath("allocations") : null,
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
  );
}
