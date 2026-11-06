"use client";
import { useState } from "react";
import {
  CalendarBlankIcon,
  CurrencyCircleDollarIcon,
  PlusIcon,
  CheckIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";
import type { InstallationBudget } from "@/lib/api";
import { listItems } from "@/lib/api";
import { useModelAdministration } from "@/hooks/use-model-administration";
import { amount, persian } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ConditionalRegion } from "@/components/ui/conditional-region";
import { Form } from "@/components/ui/form";
import { Field, FormMessage } from "@/components/ui/field";
import { Input, AmountInput } from "@/components/ui/input";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableRowHeader,
  TableCell,
  TableEmptyCell,
} from "@/components/ui/table";
import { Panel } from "./page-parts";
export function InstallationBudgetPanel({
  controller,
}: {
  controller: ReturnType<typeof useModelAdministration>;
}) {
  const { budgets, budgetCommand, saveBudget } = controller;
  const unlimited = controller.configuration.data?.budget_mode === "unlimited";
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState("");
  const [cap, setCap] = useState("");
  const [sessionCap, setSessionCap] = useState("");
  function edit(budget: InstallationBudget | null) {
    setPeriod(budget?.period || new Date().toISOString().slice(0, 7));
    setCap(budget?.cap || "");
    setSessionCap(budget?.per_session_cap || "");
    budgetCommand.clearError();
    setOpen(true);
  }
  return (
    <>
      <Panel
        title="بودجه کل نصب"
        action={
          <Button variant="secondary" disabled={unlimited} onClick={() => edit(null)}>
            <PlusIcon size={17} className="text-primary" aria-hidden />
            تعیین سقف
          </Button>
        }
      >
        {unlimited && <p className="mb-4 text-sm text-muted">بودجه AI نامحدود است.</p>}
        {budgets.loading ? (
          <LoadingState />
        ) : budgets.error ? (
          <ErrorState
            message={budgets.error.message}
            onRetry={budgets.refresh}
          />
        ) : (
          <ConditionalRegion>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>دوره هزینه</TableHead>
                  <TableHead>سقف کل (USD)</TableHead>
                  <TableHead>سقف هر نوبت (USD)</TableHead>
                  <TableHead>مصرف</TableHead>
                  <TableHead>رزرو</TableHead>
                  <TableHead>
                    <span className="sr-only">ویرایش</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listItems(budgets.data).length ? (
                  listItems(budgets.data).map((budget) => (
                    <TableRow key={budget.id}>
                      <TableRowHeader>
                        <span dir="ltr">{persian(budget.period)}</span>
                      </TableRowHeader>
                      <TableCell>{unlimited ? "نامحدود" : amount(budget.cap)}</TableCell>
                      <TableCell>
                        {unlimited ? "نامحدود" : budget.per_session_cap == null
                          ? "تعیین نشده"
                          : amount(budget.per_session_cap)}
                      </TableCell>
                      <TableCell>{amount(budget.used)}</TableCell>
                      <TableCell>{amount(budget.reserved)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" disabled={unlimited} onClick={() => edit(budget)}>
                          <PencilSimpleIcon size={18} className="text-primary" aria-hidden />
                          ویرایش
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={6} title={unlimited ? "بودجه نامحدود؛ هنوز مصرفی ثبت نشده" : "بودجه نصب تعیین نشده"} />
                )}
              </TableBody>
            </Table>
          </ConditionalRegion>
        )}
      </Panel>
      <Drawer open={open} onOpenChange={setOpen} title="بودجه کل نصب">
        <Form
          fieldErrors={budgetCommand.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            void saveBudget(
              { period, cap, per_session_cap: sessionCap || null },
              () => setOpen(false),
            );
          }}
        >
          <Field
            id="install-period"
            name="period"
            label="دوره هزینه (سال و ماه میلادی)"
            icon={CalendarBlankIcon}
          >
            <Input
              id="install-period"
              required
              dir="ltr"
              value={period}
              pattern="[0-9]{4}-[0-9]{2}"
              onChange={(event) => setPeriod(event.target.value)}
            />
          </Field>
          <Field
            id="install-cap"
            name="cap"
            label="سقف کل (USD)"
            icon={CurrencyCircleDollarIcon}
          >
            <AmountInput
              id="install-cap"
              required
              value={cap}
              onValueChange={setCap}
            />
          </Field>
          <Field
            id="install-session-cap"
            name="per_session_cap"
            label="سقف هر نوبت (USD، اختیاری)"
            icon={CurrencyCircleDollarIcon}
          >
            <AmountInput
              id="install-session-cap"
              value={sessionCap}
              onValueChange={setSessionCap}
            />
          </Field>
          <FormMessage error>{budgetCommand.error?.message}</FormMessage>
          <Button type="submit" busy={budgetCommand.busy}>
            <CheckIcon size={18} aria-hidden />
            ذخیره سقف
          </Button>
        </Form>
      </Drawer>
    </>
  );
}
