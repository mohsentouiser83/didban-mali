"use client";

import { useState } from "react";
import { BooksIcon, PlusIcon } from "@phosphor-icons/react";
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

interface ContractMilestone {
  id: string;
  sequence: number;
  title: string;
  due_date: string | null;
  amount_irr: string;
  status: "planned" | "invoiced" | "settled";
  invoiced_amount_irr: string;
  collected_cash_irr: string;
  insurance_retained_irr: string;
  performance_retained_irr: string;
  withholding_tax_irr: string;
  retention_released: boolean;
}

interface ClientContract {
  id: string;
  contract_number: string;
  title: string;
  counterparty_id: string;
  counterparty_name: string | null;
  dimension_id: string | null;
  dimension_name: string | null;
  contract_kind: "fixed_project" | "retainer" | "time_and_material";
  status: "draft" | "active" | "completed" | "cancelled";
  start_date: string;
  total_amount_irr: string;
  insurance_retention_rate: string;
  performance_retention_rate: string;
  summary: {
    invoiced_total_irr: string;
    collected_cash_irr: string;
    unreleased_retention_irr: string;
    remaining_to_invoice_irr: string;
    remaining_to_collect_irr: string;
  };
  milestones?: ContractMilestone[];
}

interface CounterpartyOption {
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

const statusLabels: Record<ClientContract["status"], string> = {
  draft: "پیش‌نویس",
  active: "فعال",
  completed: "تکمیل‌شده",
  cancelled: "لغوشده",
};

const msStatusLabels: Record<ContractMilestone["status"], string> = {
  planned: "برنامه‌ریزی‌شده",
  invoiced: "صورت‌وضعیت‌شده",
  settled: "تسویه‌شده",
};

export function ClientContractsView() {
  const { company } = useWorkspace();
  return company ? <ClientContractsContent key={company.id} companyId={company.id} /> : <NoCompany />;
}

function ClientContractsContent({ companyId }: { companyId: string }) {
  const contracts = useResource<{ items: ClientContract[] }>(`/companies/${companyId}/client-contracts`);
  const counterparties = useResource<{ items: CounterpartyOption[] }>(`/companies/${companyId}/commercial/counterparties`);
  const dimensions = useResource<{ items: DimensionOption[] }>(`/companies/${companyId}/dimensions/options/all`);
  const command = useCommand();

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedDetail = useResource<ClientContract>(
    selectedId ? `/companies/${companyId}/client-contracts/${selectedId}` : null,
  );

  const [contractNumber, setContractNumber] = useState("");
  const [title, setTitle] = useState("");
  const [counterpartyId, setCounterpartyId] = useState("");
  const [dimensionId, setDimensionId] = useState("");
  const [contractKind, setContractKind] = useState<"fixed_project" | "retainer" | "time_and_material">("fixed_project");
  const [startDate, setStartDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [insRate, setInsRate] = useState("5");
  const [perfRate, setPerfRate] = useState("10");

  const projectOptions = (dimensions.data?.items ?? []).filter((d) => d.kind === "project");
  const customerOptions = counterparties.data?.items ?? [];

  function handleCreate() {
    if (!contractNumber.trim() || !title.trim() || !counterpartyId || !startDate || !totalAmount) return;
    void command.run(
      `/companies/${companyId}/client-contracts`,
      {
        method: "POST",
        body: {
          contract_number: contractNumber.trim(),
          title: title.trim(),
          counterparty_id: counterpartyId,
          dimension_id: dimensionId || null,
          contract_kind: contractKind,
          start_date: startDate,
          total_amount_irr: totalAmount.trim(),
          insurance_retention_rate: insRate.trim() || "5",
          performance_retention_rate: perfRate.trim() || "10",
          milestones: [{ sequence: 1, title: "مرحله اول", amount_irr: totalAmount.trim() }],
        },
      },
      () => {
        setCreateOpen(false);
        setContractNumber("");
        setTitle("");
        setTotalAmount("");
        void contracts.refresh();
      },
      "قرارداد پیمانکاری ثبت شد.",
    );
  }

  function runMilestoneAction(path: string, body: Record<string, unknown>, msg: string) {
    void command.run(
      path,
      { method: "POST", body },
      () => {
        void selectedDetail.refresh();
        void contracts.refresh();
      },
      msg,
    );
  }

  return (
    <>
      <PageHeader
        title="قراردادهای پیمانکاری"
        icon={BooksIcon}
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <PlusIcon size={18} aria-hidden />
            قرارداد جدید
          </Button>
        }
      />
      <Panel>
        {contracts.loading ? (
          <LoadingState label="در حال بارگذاری قراردادهای پیمانکاری" />
        ) : contracts.error ? (
          <ErrorState message={contracts.error.message} />
        ) : !contracts.data?.items.length ? (
          <EmptyState title="هنوز قرارداد پیمانکاری ثبت نشده است" />
        ) : (
          <Table aria-label="فهرست قراردادهای پیمانکاری">
            <TableHeader>
              <TableRow>
                <TableHead>شماره</TableHead>
                <TableHead>عنوان قرارداد</TableHead>
                <TableHead>کارفرما</TableHead>
                <TableHead>پروژه</TableHead>
                <TableHead>مبلغ کل</TableHead>
                <TableHead>دریافتی نقد</TableHead>
                <TableHead>سپرده آزادنشده</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableRowHeader>{item.contract_number}</TableRowHeader>
                  <TableCell>{item.title}</TableCell>
                  <TableCell>{item.counterparty_name ?? "—"}</TableCell>
                  <TableCell>{item.dimension_name ?? "—"}</TableCell>
                  <TableCell>{fmtIrr(item.total_amount_irr)}</TableCell>
                  <TableCell>{fmtIrr(item.summary.collected_cash_irr)}</TableCell>
                  <TableCell>{fmtIrr(item.summary.unreleased_retention_irr)}</TableCell>
                  <TableCell>
                    <Badge tone={item.status === "active" ? "primary" : "neutral"}>{statusLabels[item.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="secondary" onClick={() => setSelectedId(item.id)}>
                      مراحل و کسورات
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Drawer
        title="ثبت قرارداد پیمانکاری جدید"
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && !command.busy) setCreateOpen(false);
        }}
        footer={
          <Button form="create-client-contract" type="submit" busy={command.busy}>
            ذخیره قرارداد
          </Button>
        }
      >
        <Form
          id="create-client-contract"
          fieldErrors={command.error?.fields}
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
        >
          <Field id="contract-number" label="شماره قرارداد" required>
            <Input id="contract-number" required value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} />
          </Field>
          <Field id="contract-title" label="عنوان قرارداد" required>
            <Input id="contract-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field id="contract-cp" label="کارفرما" required>
            <Select
              id="contract-cp"
              value={counterpartyId}
              onValueChange={setCounterpartyId}
              options={customerOptions.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Field>
          <Field id="contract-project" label="پروژه مرتبط">
            <Select
              id="contract-project"
              value={dimensionId}
              onValueChange={setDimensionId}
              options={[{ value: "", label: "بدون پروژه" }, ...projectOptions.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))]}
            />
          </Field>
          <Field id="contract-kind" label="نوع قرارداد">
            <Select
              id="contract-kind"
              value={contractKind}
              onValueChange={(v) => setContractKind(v as typeof contractKind)}
              options={[
                { value: "fixed_project", label: "پروژه‌ای (مبلغ مقطوع)" },
                { value: "retainer", label: "پشتیبانی و نگهداری دوره‌ای" },
                { value: "time_and_material", label: "نفر-ساعت / کارکردی" },
              ]}
            />
          </Field>
          <Field id="contract-start" label="تاریخ شروع (میلادی YYYY-MM-DD)" required>
            <Input id="contract-start" required placeholder="2024-04-01" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field id="contract-amount" label="مبلغ کل قرارداد (ریال)" required>
            <Input id="contract-amount" required value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="contract-ins" label="سپرده بیمه (٪)">
              <Input id="contract-ins" value={insRate} onChange={(e) => setInsRate(e.target.value)} />
            </Field>
            <Field id="contract-perf" label="حسن انجام کار (٪)">
              <Input id="contract-perf" value={perfRate} onChange={(e) => setPerfRate(e.target.value)} />
            </Field>
          </div>
          <FormMessage error>{command.error?.message}</FormMessage>
        </Form>
      </Drawer>

      <Drawer
        title={selectedDetail.data ? `مراحل قرارداد ${selectedDetail.data.contract_number}` : "جزئیات قرارداد"}
        open={!!selectedId}
        onOpenChange={(open) => {
          if (!open && !command.busy) setSelectedId(null);
        }}
      >
        {selectedDetail.loading ? (
          <LoadingState label="در حال بارگذاری مراحل" />
        ) : selectedDetail.error ? (
          <ErrorState message={selectedDetail.error.message} />
        ) : selectedDetail.data ? (
          <div className="space-y-4">
            <StatusMessage tone="primary">
              نرخ سپرده بیمه: {selectedDetail.data.insurance_retention_rate}٪ | حسن انجام کار: {selectedDetail.data.performance_retention_rate}٪
            </StatusMessage>
            {(selectedDetail.data.milestones ?? []).map((ms) => (
              <div key={ms.id} className="space-y-2 rounded-control border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{ms.sequence}. {ms.title}</span>
                  <Badge tone={ms.status === "settled" ? "success" : ms.status === "invoiced" ? "primary" : "neutral"}>
                    {msStatusLabels[ms.status]}
                  </Badge>
                </div>
                <div className="text-xs text-muted">
                  مبلغ: {fmtIrr(ms.amount_irr)} | دریافتی نقد: {fmtIrr(ms.collected_cash_irr)} | بیمه: {fmtIrr(ms.insurance_retained_irr)} | حسن انجام کار: {fmtIrr(ms.performance_retained_irr)}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ms.status === "planned" && (
                    <Button
                      busy={command.busy}
                      onClick={() =>
                        runMilestoneAction(
                          `/companies/${companyId}/client-contracts/${selectedDetail.data!.id}/milestones/${ms.id}/bill`,
                          {},
                          "صورت‌وضعیت مرحله ثبت شد.",
                        )
                      }
                    >
                      ثبت صورت‌وضعیت
                    </Button>
                  )}
                  {ms.status === "invoiced" && (
                    <Button
                      busy={command.busy}
                      onClick={() =>
                        runMilestoneAction(
                          `/companies/${companyId}/client-contracts/${selectedDetail.data!.id}/milestones/${ms.id}/collect`,
                          { auto_compute_retentions: true },
                          "دریافت نقد و کسورات قانونی ثبت شد.",
                        )
                      }
                    >
                      ثبت دریافت با کسورات خودکار
                    </Button>
                  )}
                  {ms.status === "settled" && !ms.retention_released && (
                    <Button
                      variant="secondary"
                      busy={command.busy}
                      onClick={() =>
                        runMilestoneAction(
                          `/companies/${companyId}/client-contracts/${selectedDetail.data!.id}/milestones/${ms.id}/release-retention`,
                          {},
                          "آزادسازی سپرده ثبت شد.",
                        )
                      }
                    >
                      آزادسازی سپرده
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <FormMessage error>{command.error?.message}</FormMessage>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
