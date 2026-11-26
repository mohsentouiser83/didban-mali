"use client";

import { useMemo, useState } from "react";
import { api, type Employee, type EmployeeContract, type EmployeeContractInput } from "@/lib/api";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";
import { usePayrollAccess } from "./use-payroll-access";
import type { ParsedTableImport } from "@/components/ui/table";
import { toast } from "sonner";
import { persian } from "@/lib/utils";

const defaultContractInput: EmployeeContractInput = {
  employee_id: "",
  contract_type: "full_time",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: null,
  status: "active",
  base_salary: "0",
  daily_rate: "0",
  housing_allowance: "9000000",
  grocery_allowance: "14000000",
  marital_allowance: "0",
  child_allowance: "0",
  tenure_allowance: "0",
  custom_fixed_allowances: "0",
  is_insured: true,
  is_taxable: true,
  weekly_hours: "44",
  notes: "",
};

export function useContracts() {
  const workspace = useWorkspace();
  const access = usePayrollAccess(workspace);
  const command = useCommand();
  const contractsResource = useResource<{ items: EmployeeContract[]; total: number }>(
    access.canView ? workspace.companyPath("contracts") : null,
  );
  const employeesResource = useResource<{ items: Employee[]; total: number }>(
    access.canView ? workspace.companyPath("employees") : null,
  );

  const workshops = useResource<{ items: { id: string; workshop_code: string; employer_name: string; active: boolean }[] }>(
    access.canView ? workspace.companyPath("payroll/workshops") : null,
  );
  const [search, setSearch] = useState("");
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all");
  const [editing, setEditing] = useState<EmployeeContract | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<EmployeeContractInput>(defaultContractInput);

  const contracts = useMemo(() => contractsResource.data?.items || [], [contractsResource.data]);
  const employees = useMemo(() => employeesResource.data?.items || [], [employeesResource.data]);

  const filtered = useMemo(() => {
    let list = contracts;
    if (filterEmployeeId !== "all") {
      list = list.filter((c) => c.employee_id === filterEmployeeId);
    }
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (c) =>
        c.contract_number.toLowerCase().includes(term) ||
        (c.employee_name && c.employee_name.toLowerCase().includes(term)) ||
        (c.employee_code && c.employee_code.toLowerCase().includes(term)),
    );
  }, [contracts, filterEmployeeId, search]);

  const openAdd = () => {
    if (!access.canPrepare) return;
    setEditing(null);
    setForm(defaultContractInput);
    setFormOpen(true);
  };

  const openEdit = (con: EmployeeContract) => {
    if (!access.canPrepare) return;
    setEditing(con);
    setForm({
      employee_id: con.employee_id,
      contract_type: con.contract_type,
      start_date: con.start_date,
      end_date: con.end_date,
      status: con.status,
      base_salary: con.base_salary,
      daily_rate: con.daily_rate,
      housing_allowance: con.housing_allowance,
      grocery_allowance: con.grocery_allowance,
      marital_allowance: con.marital_allowance,
      child_allowance: con.child_allowance,
      tenure_allowance: con.tenure_allowance,
      custom_fixed_allowances: con.custom_fixed_allowances,
      is_insured: con.is_insured,
      is_taxable: con.is_taxable,
      notes: con.notes || "",
      workshop_id: con.workshop_id,
      work_location: con.work_location,
      work_description: con.work_description,
      weekly_hours: con.weekly_hours || "44",
      conclusion_date: con.conclusion_date,
      amendment_of_contract_id: con.amendment_of_contract_id,
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const save = async () => {
    if (!workspace.company || !access.canPrepare) return;
    const { employee_id, weekly_hours, ...fields } = form;
    const contractFields = { ...fields, weekly_hours: String(weekly_hours ?? "").trim() || null };
    const path = editing
      ? `/companies/${workspace.company.id}/contracts/${editing.id}`
      : `/companies/${workspace.company.id}/contracts`;
    const body = editing ? contractFields : { ...contractFields, employee_id };
    await command.run(
      path,
      {
        method: editing ? "PATCH" : "POST",
        version: editing?.version,
        body,
      },
      () => {
        contractsResource.refresh();
        closeForm();
      },
      editing ? "قرارداد به‌روزرسانی شد." : "قرارداد جدید با موفقیت ثبت شد.",
    );
  };

  const importFromExcel = async (parsed: ParsedTableImport) => {
    if (!workspace.company || !access.canPrepare || !parsed.rows.length) return;
    const headerMap: Record<string, number> = {};
    parsed.headers.forEach((h, i) => {
      headerMap[h.trim().toLowerCase()] = i;
    });

    const getCol = (names: string[]) => {
      for (const name of names) {
        for (const [h, idx] of Object.entries(headerMap)) {
          if (h.includes(name.toLowerCase())) return idx;
        }
      }
      return -1;
    };

    const numberIdx = getCol(["شماره قرارداد", "شماره", "contract_number"]);
    const empCodeIdx = getCol(["کد پرسنلی", "کد کارمند", "کارمند", "employee_code"]);
    const typeIdx = getCol(["نوع قرارداد", "نوع", "contract_type"]);
    const startDateIdx = getCol(["تاریخ شروع", "شروع", "start_date"]);
    const endDateIdx = getCol(["تاریخ پایان", "پایان", "end_date"]);
    const salaryIdx = getCol(["حقوق پایه", "حقوق", "base_salary"]);

    let successCount = 0;
    let failCount = 0;

    for (const row of parsed.rows) {
      const conNum = numberIdx >= 0 ? String(row[numberIdx] ?? "").trim() : "";
      const empCodeOrId = empCodeIdx >= 0 ? String(row[empCodeIdx] ?? "").trim() : "";
      if (!conNum || !empCodeOrId) continue;

      const emp = employees.find(
        (e) => e.employee_code === empCodeOrId || e.id === empCodeOrId || e.full_name === empCodeOrId
      );
      if (!emp) {
        failCount++;
        continue;
      }

      const rawType = typeIdx >= 0 && row[typeIdx] ? String(row[typeIdx]).trim().toLowerCase() : "";
      let contractType: "full_time" | "part_time" | "hourly" | "project" = "full_time";
      if (rawType.includes("پاره") || rawType.includes("part")) contractType = "part_time";
      else if (rawType.includes("ساعتی") || rawType.includes("hour")) contractType = "hourly";
      else if (rawType.includes("پروژه") || rawType.includes("project")) contractType = "project";

      const payload: EmployeeContractInput = {
        employee_id: emp.id,
        contract_number: conNum,
        contract_type: contractType,
        start_date: startDateIdx >= 0 && row[startDateIdx] ? String(row[startDateIdx]).trim() : new Date().toISOString().slice(0, 10),
        end_date: endDateIdx >= 0 && row[endDateIdx] ? String(row[endDateIdx]).trim() : null,
        status: "active",
        base_salary: salaryIdx >= 0 ? String(row[salaryIdx] ?? "0").replace(/[,٬]/g, "").trim() : "0",
        daily_rate: "0",
        housing_allowance: "9000000",
        grocery_allowance: "14000000",
        marital_allowance: "0",
        child_allowance: "0",
        tenure_allowance: "0",
        custom_fixed_allowances: "0",
        is_insured: true,
        is_taxable: true,
        notes: "ورود دسته‌جمعی از فایل اکسل",
      };

      try {
        await api(`/companies/${workspace.company.id}/contracts`, {
          method: "POST",
          body: payload,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    contractsResource.refresh();
    if (successCount > 0) {
      toast.success(`${persian(successCount)} قرارداد با موفقیت در پایگاه داده ثبت شد.`);
    }
    if (failCount > 0) {
      toast.warning(`${persian(failCount)} ردیف به دلیل نامعتبر بودن کارمند یا تکراری بودن شماره قرارداد ثبت نشد.`);
    }
  };

  return {
    workspace,
    command,
    canPrepare: access.canPrepare,
    contractNumbers: new Map(contracts.map((contract) => [contract.id, contract.contract_number])),
    contracts: filtered,
    workshopOptions: (workshops.data?.items ?? [])
      .filter((workshop) => workshop.active || workshop.id === form.workshop_id)
      .map((workshop) => ({
        value: workshop.id,
        label: `${workshop.employer_name} (${workshop.workshop_code})`,
      })),
    amendmentOptions: contracts.filter((contract) =>
      contract.employee_id === form.employee_id && contract.id !== editing?.id
    ).map((contract) => ({ value: contract.id, label: contract.contract_number })),
    employees,
    total: contractsResource.data?.total || 0,
    loading: access.loading || contractsResource.loading,
    error: access.error ?? contractsResource.error,
    search,
    setSearch,
    filterEmployeeId,
    setFilterEmployeeId,
    formOpen,
    openAdd,
    openEdit,
    closeForm,
    editing,
    form,
    setForm,
    save,
    importFromExcel,
    refresh: () => { access.refresh(); contractsResource.refresh(); },
  };
}
