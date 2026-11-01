"use client";
import { CalendarCheckIcon as HeaderIcon } from "@phosphor-icons/react";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { AmountInput, Input } from "@/components/ui/input";
import { CursorPagination } from "@/components/ui/pagination";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
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
import { listItems, type Plan } from "@/lib/api";
import { amount, displayDate } from "@/lib/utils";
import {
  CalendarBlankIcon,
  CurrencyCircleDollarIcon,
  HashIcon,
  PlusIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function PlansView() {
  const workspace = useWorkspace();
  const resource = usePagedResource<Plan>(
    workspace.companyPath("planned-payments"),
  );
  const command = useCommand();
  const [editing, setEditing] = useState<Plan | null | undefined>();
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [due, setDue] = useState("");
  const [obligation, setObligation] = useState("");
  const [invoice, setInvoice] = useState("");
  function edit(plan: Plan | null) {
    setEditing(plan);
    setLabel(plan?.label || "");
    setValue(plan?.amount || "");
    setDue(plan?.due_date || "");
    setObligation(plan?.obligation_id || "");
    setInvoice(plan?.invoice_reference || "");
    command.clearError();
  }
  if (!workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={HeaderIcon}
        title="برنامه پرداخت"
        action={
          workspace.canWrite && (
            <Button onClick={() => edit(null)}>
              <PlusIcon size={18} />
              پرداخت برنامه‌ای
            </Button>
          )
        }
      />
      <Panel>
        {resource.loading ? (
          <LoadingState />
        ) : resource.error ? (
          <ErrorState
            message={resource.error.message}
            onRetry={resource.refresh}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>تعهد</TableHead>
                  <TableHead>تاریخ پرداخت</TableHead>
                  <TableHead>
                    مبلغ ({workspace.unit === "IRR" ? "ریال" : "تومان"})
                  </TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>
                    <span className="sr-only">عملیات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listItems(resource.data).length ? (
                  listItems(resource.data).map((plan) => (
                    <TableRow key={plan.id}>
                      <TableRowHeader>{plan.label}</TableRowHeader>
                      <TableCell>{displayDate(plan.due_date)}</TableCell>
                      <TableCell>
                        {amount(plan.amount, workspace.unit)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={plan.state} />
                      </TableCell>
                      <TableCell>
                        {workspace.canWrite && plan.state !== "cancelled" && (
                          <div className="flex gap-1">
                            <Button variant="ghost" onClick={() => edit(plan)}>
                              ویرایش
                            </Button>
                            <Button
                              variant="ghost"
                              className="text-danger"
                              onClick={() => {
                                setDeleting(plan);
                                command.clearError();
                              }}
                            >
                              لغو
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={5} title="برنامه پرداختی ثبت نشده" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...resource} />
          </>
        )}
      </Panel>
      <Dialog
        title={editing ? "ویرایش برنامه پرداخت" : "پرداخت برنامه‌ای"}
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      >
        <Form
          fieldErrors={command.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            void command.run(
              workspace.companyPath(
                "planned-payments" + (editing ? `/${editing.id}` : ""),
              ),
              {
                method: editing ? "PATCH" : "POST",
                version: editing?.version,
                body: {
                  label: label.trim(),
                  amount: value,
                  due_date: due,
                  obligation_id: obligation.trim(),
                  invoice_reference: invoice.trim() || null,
                },
              },
              () => {
                setEditing(undefined);
                resource.refresh();
              },
              "برنامه پرداخت ذخیره شد.",
            );
          }}
        >
          <Field id="plan-label" label="عنوان تعهد" icon={TextAaIcon}>
            <Input
              id="plan-label"
              required
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="plan-amount"
              label="مبلغ (ریال)"
              icon={CurrencyCircleDollarIcon}
            >
              <AmountInput
                id="plan-amount"
                required
                value={value}
                onValueChange={setValue}
              />
            </Field>
            <Field
              name="due_date"
              id="plan-date"
              label="تاریخ پرداخت"
              icon={CalendarBlankIcon}
            >
              <PersianDatePicker id="plan-date" value={due} onChange={setDue} />
            </Field>
          </div>
          <Field
            name="obligation_id"
            id="plan-obligation"
            label="شناسه تعهد"
            icon={HashIcon}
          >
            <Input
              id="plan-obligation"
              required
              value={obligation}
              onChange={(event) => setObligation(event.target.value)}
            />
          </Field>
          <Field
            name="invoice_reference"
            id="plan-invoice"
            label="شماره فاکتور مرتبط"
            icon={HashIcon}
          >
            <Input
              id="plan-invoice"
              value={invoice}
              onChange={(event) => setInvoice(event.target.value)}
            />
          </Field>
          <FormMessage error>{command.error?.message}</FormMessage>
          <Button type="submit" busy={command.busy} disabled={!due}>
            ذخیره برنامه
          </Button>
        </Form>
      </Dialog>
      <ConfirmDialog
        title="برنامه پرداخت لغو شود؟"
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        busy={command.busy}
        onConfirm={() => {
          if (deleting)
            void command.run(
              workspace.companyPath(`planned-payments/${deleting.id}`),
              { method: "DELETE", version: deleting.version },
              () => {
                setDeleting(null);
                resource.refresh();
              },
              "برنامه لغو شد.",
            );
        }}
      >
        <p>{deleting?.label}</p>
        <FormMessage error>{command.error?.message}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
