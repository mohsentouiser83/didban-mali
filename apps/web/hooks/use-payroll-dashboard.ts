"use client";

import { useMemo, useState } from "react";
import type { PayrollRun, PayrollSlip } from "@/lib/api";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

export function usePayrollDashboard() {
  const workspace = useWorkspace();
  const command = useCommand();

  const runsResource = useResource<{ items: PayrollRun[]; total: number }>(
    workspace.companyPath("payroll/runs"),
  );

  const runs = useMemo(() => runsResource.data?.items || [], [runsResource.data]);
  const [selectedRunIdState, setSelectedRunId] = useState<string | null>(null);
  const selectedRunId = selectedRunIdState || runs[0]?.id || null;

  const runResource = useResource<PayrollRun>(
    selectedRunId ? workspace.companyPath(`payroll/runs/${selectedRunId}`) : null,
  );

  // Create Run Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    year: 1403,
    month: 1,
    calculation_date: new Date().toISOString().slice(0, 10),
  });

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
    if (!workspace.company || !selectedRunId) return;
    await command.run(
      `/companies/${workspace.company.id}/payroll/runs/${selectedRunId}/create-draft`,
      {
        method: "POST",
      },
      () => {
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
    selectedRun: runResource.data,
    loading: runsResource.loading,
    runLoading: runResource.loading && !!selectedRunId,
    createOpen,
    setCreateOpen,
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
    viewingSlip,
    setViewingSlip,
    refresh: () => {
      runsResource.refresh();
      runResource.refresh();
    },
  };
}
