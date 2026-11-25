"use client";

import { useMemo, useState } from "react";
import { api, type Employee, type EmployeeInput } from "@/lib/api";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";
import type { ParsedTableImport } from "@/components/ui/table";
import { toast } from "sonner";
import { persian } from "@/lib/utils";

const defaultEmployeeInput: EmployeeInput = {
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
    const body = editing
      ? {
          ...form,
          national_id: form.national_id?.trim() || null,
          father_name: form.father_name?.trim() || null,
          birth_date: form.birth_date || null,
          hire_date: form.hire_date || null,
          insurance_number: form.insurance_number?.trim() || null,
          phone: form.phone?.trim() || null,
          iban: form.iban?.trim() || null,
          bank_name: form.bank_name?.trim() || null,
          account_number: form.account_number?.trim() || null,
          job_title: form.job_title?.trim() || null,
          department: form.department?.trim() || null,
        }
      : form;
    await command.run(
      path,
      {
        method: editing ? "PATCH" : "POST",
        version: editing?.version,
        body,
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
        version: emp.version,
      },
      () => {
        resource.refresh();
      },
      "کارمند حذف/غیرفعال شد.",
    );
  };

  const importFromExcel = async (parsed: ParsedTableImport) => {
    if (!workspace.company || !parsed.rows.length) return;

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

    const codeIdx = getCol(["کد پرسنلی", "کد کارمندی", "شماره پرسنلی", "کد", "code"]);
    const fullNameIdx = getCol(["نام و نام خانوادگی", "نام کامل", "full_name"]);
    const firstNameIdx = getCol(["نام", "first_name"]);
    const lastNameIdx = getCol(["نام خانوادگی", "فامیلی", "شهرت", "last_name"]);
    const nationalIdIdx = getCol(["کد ملی", "شناسه ملی", "شماره ملی", "national_id"]);
    const jobIdx = getCol(["عنوان شغلی", "سمت", "شغل", "job_title"]);
    const deptIdx = getCol(["واحد", "دپارتمان", "بخش", "department"]);
    const phoneIdx = getCol(["تلفن", "موبایل", "شماره تماس", "phone"]);
    const ibanIdx = getCol(["شبا", "شماره شبا", "iban"]);
    const bankIdx = getCol(["بانک", "نام بانک", "bank_name"]);
    const accIdx = getCol(["شماره حساب", "حساب", "account_number"]);
    const childrenIdx = getCol(["تعداد فرزند", "اولاد", "فرزندان", "children"]);

    let successCount = 0;
    let failCount = 0;

    for (const row of parsed.rows) {
      const code = codeIdx >= 0 ? String(row[codeIdx] ?? "").trim() : "";
      if (!code) continue;

      let firstName = "";
      let lastName = "";

      if (lastNameIdx >= 0 && firstNameIdx >= 0 && lastNameIdx !== firstNameIdx) {
        firstName = String(row[firstNameIdx] ?? "").trim();
        lastName = String(row[lastNameIdx] ?? "").trim();
      } else if (fullNameIdx >= 0) {
        const parts = String(row[fullNameIdx] ?? "").trim().split(/\s+/);
        firstName = parts[0] || "";
        lastName = parts.slice(1).join(" ") || parts[0] || "";
      } else if (firstNameIdx >= 0) {
        firstName = String(row[firstNameIdx] ?? "").trim();
        lastName = code;
      }

      const payload: EmployeeInput = {
        employee_code: code,
        first_name: firstName || "کارمند",
        last_name: lastName || code,
        identity_type: "national_id",
        national_id: nationalIdIdx >= 0 ? String(row[nationalIdIdx] ?? "").trim() || undefined : undefined,
        job_title: jobIdx >= 0 ? String(row[jobIdx] ?? "").trim() || undefined : undefined,
        department: deptIdx >= 0 ? String(row[deptIdx] ?? "").trim() || undefined : undefined,
        phone: phoneIdx >= 0 ? String(row[phoneIdx] ?? "").trim() || undefined : undefined,
        iban: ibanIdx >= 0 ? String(row[ibanIdx] ?? "").trim() || undefined : undefined,
        bank_name: bankIdx >= 0 ? String(row[bankIdx] ?? "").trim() || undefined : undefined,
        account_number: accIdx >= 0 ? String(row[accIdx] ?? "").trim() || undefined : undefined,
        children_count: childrenIdx >= 0 ? Number(row[childrenIdx]) || 0 : 0,
        marital_status: "single",
        active: true,
        is_veteran_or_child: false,
        is_foreign_national: false,
        is_science_park_staff: false,
        has_disability_charge: false,
        is_underdeveloped_region: false,
        is_retired: false,
      };

      try {
        await api(`/companies/${workspace.company.id}/employees`, {
          method: "POST",
          body: payload,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    resource.refresh();
    if (successCount > 0) {
      toast.success(`${persian(successCount)} کارمند جدید با موفقیت از اکسل در سامانه ثبت شد.`);
    }
    if (failCount > 0) {
      toast.warning(`${persian(failCount)} ردیف به دلیل خطای اعتبارسنجی یا تکراری بودن کد پرسنلی ثبت نشد.`);
    }
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
    importFromExcel,
    refresh: resource.refresh,
  };
}
