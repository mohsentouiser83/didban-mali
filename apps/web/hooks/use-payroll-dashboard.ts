"use client";

import { useMemo, useState } from "react";
import type { PayrollRun, PayrollSlip } from "@/lib/api";
import { tehranToday } from "@/lib/native-invoices";
import { useAccountOptions } from "./use-accounting";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

function payrollForm(calculationDate: string) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
    timeZone: "UTC", year: "numeric", month: "numeric",
  }).formatToParts(new Date(calculationDate + "T12:00:00Z"));
  return {
    title: "",
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    calculation_date: calculationDate,
  };
}

export function usePayrollDashboard() {
  const workspace = useWorkspace();
  const command = useCommand();

  const periodQuery = workspace.periodId ? `?period_id=${encodeURIComponent(workspace.periodId)}` : "";
  const runsResource = useResource<{ items: PayrollRun[]; total: number }>(
    workspace.companyPath("payroll/runs" + periodQuery),
  );

  const runs = useMemo(() => runsResource.data?.items || [], [runsResource.data]);
  const [selectedRunIdState, setSelectedRunId] = useState<string | null>(null);
  const selectedRunId = runs.find((run) => run.id === selectedRunIdState)?.id ?? runs[0]?.id ?? null;

  const runResource = useResource<PayrollRun>(
    selectedRunId ? workspace.companyPath(`payroll/runs/${selectedRunId}`) : null,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(() => payrollForm(tehranToday()));
  function openCreateRun() {
    const today = tehranToday();
    const period = workspace.periods.find((item) => item.id === workspace.periodId);
    if (!period) return;
    const calculationDate = today < period.start ? period.start : today > period.end ? period.end : today;
    setCreateForm(payrollForm(calculationDate));
    command.clearError();
    setCreateOpen(true);
  }

  const [draftRunId, setDraftRunId] = useState<string | null>(null);
  const [draftAccounts, setDraftAccounts] = useState<Record<string, string>>({});
  const draftOpen = draftRunId !== null && draftRunId === selectedRunId;
  const accounts = useAccountOptions(draftOpen ? workspace.company?.id ?? "" : "");
  const selectedRun = runResource.data;
  const roles = [
    { key: "salary_expense", label: "هزینه حقوق", required: Number(selectedRun?.total_gross) > 0 },
    { key: "employer_insurance_expense", label: "هزینه بیمه سهم کارفرما", required: Number(selectedRun?.total_employer_insurance) > 0 },
    { key: "payroll_payable", label: "حقوق پرداختنی", required: Number(selectedRun?.total_net) > 0 },
    { key: "insurance_payable", label: "بیمه پرداختنی", required: Number(selectedRun?.total_employee_insurance) > 0 || Number(selectedRun?.total_employer_insurance) > 0 },
    { key: "payroll_tax_payable", label: "مالیات حقوق پرداختنی", required: Number(selectedRun?.total_tax) > 0 },
    { key: "other_deductions_payable", label: "سایر کسورات پرداختنی", required: Number(selectedRun?.total_other_deductions) > 0 },
  ].filter((role) => role.required);
  const canCreateDraft = roles.length > 0 && roles.every((role) => draftAccounts[role.key]);
  function openDraft() {
    setDraftAccounts({});
    command.clearError();
    setDraftRunId(selectedRunId);
  }
  function closeDraft() {
    setDraftRunId(null);
    command.clearError();
  }

  // Edit Timesheet Modal
  const [editingSlip, setEditingSlip] = useState<PayrollSlip | null>(null);
  const [slipForm, setSlipForm] = useState({
    work_days: "30",
    work_hours: "0",
    overtime_hours: "0",
    advance_payment: "0",
    loan_installment: "0",
    other_deductions: "0",
    bonus_amount: "0",
  });

  // Selected slip for payslip modal / print
  const [viewingSlip, setViewingSlip] = useState<PayrollSlip | null>(null);

  const openEditSlip = (slip: PayrollSlip) => {
    setEditingSlip(slip);
    setSlipForm({
      work_days: slip.work_days || "30",
      work_hours: slip.work_hours || "0",
      overtime_hours: slip.overtime_hours || "0",
      advance_payment: slip.advance_payment || "0",
      loan_installment: slip.loan_installment || "0",
      other_deductions: slip.other_deductions || "0",
      bonus_amount: slip.bonus_amount || "0",
    });
  };

  const closeEditSlip = () => {
    setEditingSlip(null);
  };

  const handleCreateRun = async () => {
    if (!workspace.company || !workspace.periodId) return;
    const payload = {
      period_id: workspace.periodId,
      title: createForm.title || `لیست حقوق ماه ${createForm.month} سال ${createForm.year}`,
      year: Number(createForm.year),
      month: Number(createForm.month),
      calculation_date: createForm.calculation_date,
    };
    await command.run<PayrollRun>(
      `/companies/${workspace.company.id}/payroll/runs`,
      {
        method: "POST",
        body: payload,
      },
      (created) => {
        runsResource.refresh();
        if (created?.id) setSelectedRunId(created.id);
        setCreateOpen(false);
      },
      "لیست حقوق جدید با موفقیت ایجاد و فیش‌ها محاسبه شدند.",
    );
  };

  const handleSaveSlipTimesheet = async () => {
    if (!workspace.company || !selectedRunId || !editingSlip) return;
    await command.run(
      `/companies/${workspace.company.id}/payroll/runs/${selectedRunId}/slips/${editingSlip.id}`,
      {
        method: "PATCH",
        body: slipForm,
      },
      () => {
        runResource.refresh();
        runsResource.refresh();
        closeEditSlip();
      },
      "کارکرد ماهانه کارمند به‌روز و فیش مجدداً محاسبه شد.",
    );
  };

  const handleCreateDraft = async () => {
    if (!workspace.company || !selectedRunId || !selectedRun || !canCreateDraft) return;
    await command.run(
      `/companies/${workspace.company.id}/payroll/runs/${selectedRunId}/create-draft`,
      {
        method: "POST",
        body: { expected_version: selectedRun.version, accounts: draftAccounts },
      },
      () => {
        closeDraft();
        runResource.refresh();
        runsResource.refresh();
      },
      "پیش‌نویس سند دوبل شناسایی حقوق ایجاد شد و به دفتر حسابداری ارسال گردید.",
    );
  };

  return {
    workspace,
    command,
    runs,
    selectedRunId,
    setSelectedRunId,
    selectedRun,
    loading: runsResource.loading,
    runLoading: runResource.loading && !!selectedRunId,
    createOpen,
    setCreateOpen,
    openCreateRun,
    createForm,
    setCreateForm,
    handleCreateRun,
    editingSlip,
    slipForm,
    setSlipForm,
    openEditSlip,
    closeEditSlip,
    handleSaveSlipTimesheet,
    handleCreateDraft,
    openDraft,
    closeDraft,
    draftOpen,
    draftAccounts,
    setDraftAccount: (key: string, value: string) => setDraftAccounts((current) => ({ ...current, [key]: value })),
    roles,
    canCreateDraft,
    accountOptions: accounts.items.filter((account) => account.active).map((account) => ({
      value: account.id, label: `${account.code} · ${account.name}`,
    })),
    accountsLoading: accounts.loading,
    accountsError: accounts.error?.message,
    viewingSlip,
    setViewingSlip,
    refresh: () => {
      runsResource.refresh();
      runResource.refresh();
    },
  };
}
