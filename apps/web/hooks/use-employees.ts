"use client";

import { useMemo, useState } from "react";
import type { Employee, EmployeeInput } from "@/lib/api";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

const defaultEmployeeInput: EmployeeInput = {
  employee_code: "",
  first_name: "",
  last_name: "",
  identity_type: "national_id",
  national_id: "",
  father_name: "",
  phone: "",
  iban: "",
  bank_name: "",
  account_number: "",
  job_title: "",
  department: "",
  marital_status: "single",
  children_count: 0,
  active: true,
  is_veteran_or_child: false,
  is_foreign_national: false,
  is_science_park_staff: false,
  has_disability_charge: false,
  is_underdeveloped_region: false,
  is_retired: false,
};

export function useEmployees() {
  const workspace = useWorkspace();
  const command = useCommand();
  const resource = useResource<{ items: Employee[]; total: number }>(
    workspace.companyPath("employees"),
  );

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<EmployeeInput>(defaultEmployeeInput);

  const employees = useMemo(() => resource.data?.items || [], [resource.data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter(
      (e) =>
        e.employee_code.toLowerCase().includes(term) ||
        e.full_name.toLowerCase().includes(term) ||
        (e.national_id && e.national_id.includes(term)) ||
        (e.job_title && e.job_title.toLowerCase().includes(term)),
    );
  }, [employees, search]);

  const openAdd = () => {
    setEditing(null);
    setForm(defaultEmployeeInput);
    setFormOpen(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setForm({
      employee_code: emp.employee_code,
      first_name: emp.first_name,
      last_name: emp.last_name,
      identity_type: emp.identity_type,
      national_id: emp.national_id || "",
      father_name: emp.father_name || "",
      birth_date: emp.birth_date || undefined,
      hire_date: emp.hire_date || undefined,
      insurance_number: emp.insurance_number || "",
      phone: emp.phone || "",
      iban: emp.iban || "",
      bank_name: emp.bank_name || "",
      account_number: emp.account_number || "",
      job_title: emp.job_title || "",
      department: emp.department || "",
      marital_status: emp.marital_status,
      children_count: emp.children_count,
      active: emp.active,
      is_veteran_or_child: emp.is_veteran_or_child,
      is_foreign_national: emp.is_foreign_national,
      is_science_park_staff: emp.is_science_park_staff,
      has_disability_charge: emp.has_disability_charge,
      is_underdeveloped_region: emp.is_underdeveloped_region,
      is_retired: emp.is_retired,
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
      ? `/companies/${workspace.company.id}/employees/${editing.id}`
      : `/companies/${workspace.company.id}/employees`;
    await command.run(
      path,
      {
        method: editing ? "PATCH" : "POST",
        version: editing?.version,
        body: form,
      },
      () => {
        resource.refresh();
        closeForm();
      },
      editing ? "مشخصات کارمند به‌روز شد." : "کارمند جدید با موفقیت ثبت شد.",
    );
  };

  const remove = async (emp: Employee) => {
    if (!workspace.company) return;
    await command.run(
      `/companies/${workspace.company.id}/employees/${emp.id}`,
      {
        method: "DELETE",
      },
      () => {
        resource.refresh();
      },
      "کارمند حذف/غیرفعال شد.",
    );
  };

  return {
    workspace,
    command,
    employees: filtered,
    total: resource.data?.total || 0,
    loading: resource.loading,
    error: resource.error,
    search,
    setSearch,
    formOpen,
    openAdd,
    openEdit,
    closeForm,
    editing,
    form,
    setForm,
    save,
    remove,
    refresh: resource.refresh,
  };
}
