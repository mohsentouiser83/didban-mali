"use client";

import { useMemo, useState } from "react";
import type { Employee, EmployeeContract, EmployeeContractInput } from "@/lib/api";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

const defaultContractInput: EmployeeContractInput = {
  employee_id: "",
  contract_number: "",
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
  notes: "",
};

export function useContracts() {
  const workspace = useWorkspace();
  const command = useCommand();
  const contractsResource = useResource<{ items: EmployeeContract[]; total: number }>(
    workspace.companyPath("contracts"),
  );
  const employeesResource = useResource<{ items: Employee[]; total: number }>(
    workspace.companyPath("employees"),
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
    setEditing(null);
    setForm(defaultContractInput);
    setFormOpen(true);
  };

  const openEdit = (con: EmployeeContract) => {
    setEditing(con);
    setForm({
      employee_id: con.employee_id,
      contract_number: con.contract_number,
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
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const save = async () => {
    if (!workspace.company) return;
    const path = editing
      ? `/companies/${workspace.company.id}/contracts/${editing.id}`
      : `/companies/${workspace.company.id}/contracts`;
    await command.run(
      path,
      {
        method: editing ? "PATCH" : "POST",
        version: editing?.version,
        body: form,
      },
      () => {
        contractsResource.refresh();
        closeForm();
      },
      editing ? "قرارداد به‌روزرسانی شد." : "قرارداد جدید با موفقیت ثبت شد.",
    );
  };

  return {
    workspace,
    command,
    contracts: filtered,
    employees,
    total: contractsResource.data?.total || 0,
    loading: contractsResource.loading,
    error: contractsResource.error,
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
    refresh: contractsResource.refresh,
  };
}
