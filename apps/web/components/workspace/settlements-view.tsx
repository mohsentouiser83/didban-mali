"use client";
import { ArrowsLeftRightIcon as HeaderIcon } from "@phosphor-icons/react";
import { SearchSelect } from "@/components/ui/search-select";
import { useAllocationChoices } from "@/hooks/use-allocation-choices";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
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
import { amount } from "@/lib/utils";
import {
  ArrowCounterClockwiseIcon,
  CurrencyCircleDollarIcon,
  PlusIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function SettlementsView() {
  const workspace = useWorkspace();
  const allocations = usePagedResource<Allocation>(
    workspace.companyPath("allocations"),
  );
  const choices = useAllocationChoices();
  const { banks, invoices } = choices;
  const command = useCommand();
  const [open, setOpen] = useState(false);
  const [reversing, setReversing] = useState<Allocation | null>(null);
  const [bankId, setBankId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  if (!workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={HeaderIcon}
        title="دریافت و پرداخت"
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/settlements/plans" variant="secondary">
              برنامه پرداخت
            </ButtonLink>
            {workspace.canWrite && (
              <Button
                onClick={() => {
                  setOpen(true);
                  command.clearError();
                }}
              >
                تخصیص پرداخت
                <PlusIcon size={16} />
              </Button>
            )}
          </div>
        }
      />
      <Panel title="ارتباط پرداخت و فاکتور">
        {allocations.loading ? (
          <LoadingState />
        ) : allocations.error ? (
          <ErrorState
            message={allocations.error.message}
            onRetry={allocations.refresh}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>فاکتور</TableHead>
                  <TableHead>مرجع بانکی</TableHead>
                  <TableHead>
                    مبلغ ({workspace.unit === "IRR" ? "ریال" : "تومان"})
                  </TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>
                    <span className="sr-only">برگشت تخصیص</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listItems(allocations.data).length ? (
                  listItems(allocations.data).map((allocation) => (
                    <TableRow key={allocation.id}>
                      <TableRowHeader>
                        {allocation.invoice_reference ||
                          listItems(invoices.data).find(
                            (invoice) => invoice.id === allocation.invoice_id,
                          )?.reference ||
                          allocation.invoice_id}
                      </TableRowHeader>
                      <TableCell>
                        {allocation.bank_reference ||
                          listItems(banks.data).find(
                            (bank) => bank.id === allocation.bank_id,
                          )?.reference ||
                          allocation.bank_id}
                      </TableCell>
                      <TableCell>
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
                  ))
                ) : (
                  <TableEmptyCell colSpan={5} title="تخصیصی ثبت نشده" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...allocations} />
          </>
        )}
      </Panel>
      <Dialog title="تخصیص پرداخت به فاکتور" open={open} onOpenChange={setOpen}>
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
          <Field name="bank_id" id="allocation-bank" label="گردش بانک">
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
          <Field name="invoice_id" id="allocation-invoice" label="فاکتور">
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
      </Dialog>
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
