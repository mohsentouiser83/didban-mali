"use client";

import { useMemo, useState } from "react";
import type {
  EmployeeSettlementResponse,
  InsuranceDiskResponse,
  PayrollRun,
  PayrollSlip,
  TaxDiskResponse,
} from "@/lib/api";
import { tehranToday } from "@/lib/native-invoices";
import { isAccountPostable } from "@/lib/account-catalogue";
import { useAccountOptions } from "./use-accounting";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";
import { usePayrollAccess } from "./use-payroll-access";

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
  const access = usePayrollAccess(workspace);
  const command = useCommand();

  const periodQuery = workspace.periodId ? `?period_id=${encodeURIComponent(workspace.periodId)}` : "";
  const runsResource = useResource<{ items: PayrollRun[]; total: number }>(
    access.canView ? workspace.companyPath("payroll/runs" + periodQuery) : null,
  );

  const runs = useMemo(() => runsResource.data?.items || [], [runsResource.data]);
  const [selectedRunIdState, setSelectedRunId] = useState<string | null>(null);
  const selectedRunId = runs.find((run) => run.id === selectedRunIdState)?.id ?? runs[0]?.id ?? null;

  const runResource = useResource<PayrollRun>(
    access.canView && selectedRunId ? workspace.companyPath(`payroll/runs/${selectedRunId}`) : null,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(() => payrollForm(tehranToday()));
  function openCreateRun() {
    if (!access.canPrepare) return;
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
    if (!access.canPrepare) return;
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
    if (!access.canPrepare) return;
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
    if (!access.canPrepare || !workspace.company || !workspace.periodId) return;
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
    if (!access.canPrepare || !workspace.company || !selectedRunId || !editingSlip) return;
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

  // Insurance & Tax Diskettes
  const [insuranceDiskOpen, setInsuranceDiskOpen] = useState(false);
  const insuranceDiskResource = useResource<InsuranceDiskResponse>(
    access.canView && insuranceDiskOpen && selectedRunId
      ? workspace.companyPath(`payroll/runs/${selectedRunId}/insurance-disk`)
      : null,
  );

  const [taxDiskOpen, setTaxDiskOpen] = useState(false);
  const taxDiskResource = useResource<TaxDiskResponse>(
    access.canView && taxDiskOpen && selectedRunId
      ? workspace.companyPath(`payroll/runs/${selectedRunId}/tax-disk`)
      : null,
  );

  // Settlement (Eydi, Sanavat, Leave)
  const [settlementEmployeeId, setSettlementEmployeeId] = useState<string | null>(null);
  const settlementResource = useResource<EmployeeSettlementResponse>(
    access.canView && settlementEmployeeId
      ? workspace.companyPath(`employees/${settlementEmployeeId}/settlement`)
      : null,
  );

  // Batch Monthly Attendance / Timesheet
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [batchAttendance, setBatchAttendance] = useState<
    Array<{
      employee_id: string;
      employee_code?: string;
      employee_name?: string;
      work_days: string;
      work_hours: string;
      overtime_hours: string;
      absence_days: string;
      bonus_amount: string;
      advance_payment: string;
    }>
  >([]);

  function openAttendance() {
    if (!access.canPrepare || !selectedRun?.slips) return;
    setBatchAttendance(
      selectedRun.slips.map((s) => ({
        employee_id: s.employee_id,
        employee_code: s.employee_code,
        employee_name: s.employee_name,
        work_days: s.work_days || "30",
        work_hours: s.work_hours || "0",
        overtime_hours: s.overtime_hours || "0",
        absence_days: s.absence_days || "0",
        bonus_amount: s.bonus_amount || "0",
        advance_payment: s.advance_payment || "0",
      })),
    );
    setAttendanceOpen(true);
  }

  const handleSaveBatchAttendance = async () => {
    if (!access.canPrepare || !workspace.company || !selectedRunId) return;
    await command.run(
      `/companies/${workspace.company.id}/payroll/runs/${selectedRunId}/slips/batch`,
      {
        method: "POST",
        body: {
          slips: batchAttendance.map((item) => ({
            employee_id: item.employee_id,
            work_days: item.work_days,
            work_hours: item.work_hours,
            overtime_hours: item.overtime_hours,
            absence_days: item.absence_days,
            bonus_amount: item.bonus_amount,
            advance_payment: item.advance_payment,
          })),
        },
      },
      () => {
        runResource.refresh();
        runsResource.refresh();
        setAttendanceOpen(false);
      },
      "کارکرد ماهانه پرسنل با موفقیت ثبت و فیش‌ها باز‌محاسبه شدند.",
    );
  };

  const handleCreateDraft = async () => {
    if (!access.canPrepare || !workspace.company || !selectedRunId || !selectedRun || !canCreateDraft) return;
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
    canPrepare: access.canPrepare,
    runs,
    selectedRunId,
    setSelectedRunId,
    selectedRun,
    loading: access.loading || runsResource.loading,
    error: access.error ?? runsResource.error,
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
    accountOptions: accounts.items.filter((account) => isAccountPostable(account)).map((account) => ({
      value: account.id, label: `${account.code} · ${account.name}`,
    })),
    accountsLoading: accounts.loading,
    accountsError: accounts.error?.message,
    viewingSlip,
    setViewingSlip,
    // Insurance Diskette
    insuranceDiskOpen,
    setInsuranceDiskOpen,
    insuranceDiskData: insuranceDiskResource.data,
    insuranceDiskLoading: insuranceDiskResource.loading,
    // Tax Diskette
    taxDiskOpen,
    setTaxDiskOpen,
    taxDiskData: taxDiskResource.data,
    taxDiskLoading: taxDiskResource.loading,
    // Attendance Batch
    attendanceOpen,
    setAttendanceOpen,
    openAttendance,
    batchAttendance,
    setBatchAttendance,
    handleSaveBatchAttendance,
    // Settlement
    settlementEmployeeId,
    setSettlementEmployeeId,
    settlementData: settlementResource.data,
    settlementLoading: settlementResource.loading,
    refresh: () => {
      access.refresh();
      runsResource.refresh();
      runResource.refresh();
    },
  };
}
