"use client";

import { useState } from "react";
import { PlusIcon, WalletIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/ui/table";
import { useCommand } from "@/hooks/use-command";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import { NoCompany, PageHeader, Panel } from "./page-parts";

interface PettyCashExpense {
  id: string;
  treasury_account_id: string;
  category: string;
  expense_date: string;
  title: string;
  amount_irr: string;
  receipt_reference: string | null;
  status: "recorded" | "settled" | "cancelled";
}

interface TreasuryOption {
  id: string;
  kind: string;
  name: string;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

interface PeriodOption {
  id: string;
  name: string;
}

interface DimensionOption {
  id: string;
  kind: string;
  code: string;
  name: string;
}

const fmtIrr = (val: string | number | null | undefined) => `${Number(val || 0).toLocaleString("fa-IR")} ریال`;

const categoryLabels: Record<string, string> = {
  cloud_server: "سرور و زیرساخت ابری",
  software_license: "لایسنس و اشتراک نرم‌افزار",
  subcontractor: "پیمانکار فرعی",
  transport: "ایاب‌وذهاب",
  meals: "پذیرایی",
  office_supplies: "ملزومات اداری",
  utilities: "قبوض و ارتباطات",
  other: "سایر هزینه‌ها",
};

const statusLabels: Record<PettyCashExpense["status"], string> = {
  recorded: "ثبت‌شده (باز)",
  settled: "تسویه‌شده",
  cancelled: "لغوشده",
};

export function PettyCashView() {
  const { company } = useWorkspace();
  return company ? <PettyCashContent key={company.id} companyId={company.id} /> : <NoCompany />;
}

function PettyCashContent({ companyId }: { companyId: string }) {
  const expenses = useResource<{
    items: PettyCashExpense[];
    summary: { recorded_total_irr: string; settled_total_irr: string };
  }>(`/companies/${companyId}/petty-cash/expenses`);
  const treasury = useResource<{ items: TreasuryOption[] }>(`/companies/${companyId}/treasury/accounts`);
  const accounts = useResource<{ items: AccountOption[] }>(`/companies/${companyId}/accounting/accounts`);
  const periods = useResource<{ items: PeriodOption[] }>(`/companies/${companyId}/periods`);
  const dimensions = useResource<{ items: DimensionOption[] }>(`/companies/${companyId}/dimensions/options/all`);
  const command = useCommand();

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);

  const [pettyId, setPettyId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [expAccountId, setExpAccountId] = useState("");
  const [dimensionId, setDimensionId] = useState("");
  const [category, setCategory] = useState("cloud_server");
  const [expenseDate, setExpenseDate] = useState("");
  const [title, setTitle] = useState("");
  const [amountIrr, setAmountIrr] = useState("");
  const [receiptRef, setReceiptRef] = useState("");
  const [bankId, setBankId] = useState("");

  const pettyAccounts = (treasury.data?.items ?? []).filter((a) => a.kind === "petty_cash");
  const bankAccounts = (treasury.data?.items ?? []).filter((a) => a.kind === "bank" || a.kind === "cash");
  const projectOptions = (dimensions.data?.items ?? []).filter((d) => d.kind === "project");

  function handleRecordExpense() {
    if (!pettyId || !periodId || !expAccountId || !expenseDate || !title.trim() || !amountIrr) return;
    void command.run(
      `/companies/${companyId}/petty-cash/expenses`,
      {
        method: "POST",
        body: {
          treasury_account_id: pettyId,
          period_id: periodId,
          expense_account_id: expAccountId,
          dimension_id: dimensionId || null,
          category,
          expense_date: expenseDate,
          title: title.trim(),
          amount_irr: amountIrr.trim(),
          receipt_reference: receiptRef.trim() || null,
        },
      },
      () => {
        setExpenseOpen(false);
        setTitle("");
        setAmountIrr("");
        setReceiptRef("");
        void expenses.refresh();
      },
      "هزینه تنخواه ثبت شد.",
    );
  }

  function handleSettle() {
    if (!pettyId || !periodId || !expenseDate) return;
    void command.run(
      `/companies/${companyId}/petty-cash/settlements`,
      {
        method: "POST",
        body: {
          treasury_account_id: pettyId,
          period_id: periodId,
          settlement_date: expenseDate,
          replenish_from_treasury_id: bankId || null,
        },
      },
      () => {
        setSettleOpen(false);
        void expenses.refresh();
      },
      "پیش‌نویس سند تسویه تنخواه ایجاد شد.",
    );
  }

  return (
    <>
      <PageHeader
        title="تنخواه‌گردانی و هزینه‌ها"
        icon={WalletIcon}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setSettleOpen(true)}>
              تسویه و شارژ تنخواه
            </Button>
            <Button onClick={() => setExpenseOpen(true)}>
              <PlusIcon size={18} aria-hidden />
              ثبت هزینه تنخواه
            </Button>
          </div>
        }
      />
      <Panel>
        {expenses.data && (
          <div className="mb-4">
            <StatusMessage tone="primary">
              جمع هزینه‌های باز: {fmtIrr(expenses.data.summary.recorded_total_irr)} | جمع تسویه‌شده:{" "}
              {fmtIrr(expenses.data.summary.settled_total_irr)}
            </StatusMessage>
          </div>
        )}
        {expenses.loading ? (
          <LoadingState label="در حال بارگذاری هزینه‌های تنخواه" />
        ) : expenses.error ? (
          <ErrorState message={expenses.error.message} />
        ) : !expenses.data?.items.length ? (
          <EmptyState title="هنوز هزینه تنخواهی ثبت نشده است" />
        ) : (
          <Table aria-label="فهرست هزینه‌های تنخواه">
            <TableHeader>
              <TableRow>
                <TableHead>عنوان</TableHead>
                <TableHead>دسته‌بندی</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>مبلغ</TableHead>
                <TableHead>شماره رسید</TableHead>
                <TableHead>وضعیت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableRowHeader>{item.title}</TableRowHeader>
                  <TableCell>{categoryLabels[item.category] ?? item.category}</TableCell>
                  <TableCell>{item.expense_date}</TableCell>
                  <TableCell>{fmtIrr(item.amount_irr)}</TableCell>
                  <TableCell>{item.receipt_reference ?? "—"}</TableCell>
                  <TableCell>
                    <Badge tone={item.status === "settled" ? "success" : item.status === "recorded" ? "primary" : "neutral"}>
                      {statusLabels[item.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Drawer
        title="ثبت هزینه تنخواه"
        open={expenseOpen}
        onOpenChange={(open) => {
          if (!open && !command.busy) setExpenseOpen(false);
        }}
        footer={
          <Button form="record-petty-expense" type="submit" busy={command.busy}>
            ثبت هزینه
          </Button>
        }
      >
        <Form
          id="record-petty-expense"
          fieldErrors={command.error?.fields}
          onSubmit={(e) => {
            e.preventDefault();
            handleRecordExpense();
          }}
        >
          <Field id="pe-account" label="حساب تنخواه" required>
            <Select
              id="pe-account"
              value={pettyId}
              onValueChange={setPettyId}
              options={pettyAccounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
          <Field id="pe-period" label="دوره مالی" required>
            <Select
              id="pe-period"
              value={periodId}
              onValueChange={setPeriodId}
              options={(periods.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field id="pe-exp-acc" label="سرفصل حساب هزینه" required>
            <Select
              id="pe-exp-acc"
              value={expAccountId}
              onValueChange={setExpAccountId}
              options={(accounts.data?.items ?? []).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
            />
          </Field>
          <Field id="pe-project" label="پروژه (اختیاری)">
            <Select
              id="pe-project"
              value={dimensionId}
              onValueChange={setDimensionId}
              options={[{ value: "", label: "هزینه عمومی / سربار" }, ...projectOptions.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))]}
            />
          </Field>
          <Field id="pe-cat" label="دسته‌بندی">
            <Select
              id="pe-cat"
              value={category}
              onValueChange={setCategory}
              options={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field id="pe-date" label="تاریخ هزینه (YYYY-MM-DD)" required>
            <Input id="pe-date" required placeholder="2024-05-01" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </Field>
          <Field id="pe-title" label="شرح هزینه" required>
            <Input id="pe-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field id="pe-amount" label="مبلغ (ریال)" required>
            <Input id="pe-amount" required value={amountIrr} onChange={(e) => setAmountIrr(e.target.value)} />
          </Field>
          <Field id="pe-receipt" label="شماره فاکتور / رسید">
            <Input id="pe-receipt" value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} />
          </Field>
          <FormMessage error>{command.error?.message}</FormMessage>
        </Form>
      </Drawer>

      <Drawer
        title="تسویه و شارژ مجدد تنخواه"
        open={settleOpen}
        onOpenChange={(open) => {
          if (!open && !command.busy) setSettleOpen(false);
        }}
        footer={
          <Button form="settle-petty-cash" type="submit" busy={command.busy}>
            صدور پیش‌نویس تسویه
          </Button>
        }
      >
        <Form
          id="settle-petty-cash"
          fieldErrors={command.error?.fields}
          onSubmit={(e) => {
            e.preventDefault();
            handleSettle();
          }}
        >
          <Field id="ps-account" label="حساب تنخواه" required>
            <Select
              id="ps-account"
              value={pettyId}
              onValueChange={setPettyId}
              options={pettyAccounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
          <Field id="ps-period" label="دوره مالی" required>
            <Select
              id="ps-period"
              value={periodId}
              onValueChange={setPeriodId}
              options={(periods.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Field id="ps-date" label="تاریخ تسویه (YYYY-MM-DD)" required>
            <Input id="ps-date" required placeholder="2024-05-05" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </Field>
          <Field id="ps-bank" label="حساب بانک/صندوق برای شارژ مجدد (اختیاری)">
            <Select
              id="ps-bank"
              value={bankId}
              onValueChange={setBankId}
              options={[{ value: "", label: "فقط تسویه از مانده تنخواه" }, ...bankAccounts.map((b) => ({ value: b.id, label: b.name }))]}
            />
          </Field>
          <FormMessage error>{command.error?.message}</FormMessage>
        </Form>
      </Drawer>
    </>
  );
}
