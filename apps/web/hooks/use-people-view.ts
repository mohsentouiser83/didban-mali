"use client";
import type { Metric } from "@/lib/api";
import { useState } from "react";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";
export type PeopleKind = "employees" | "payroll" | "tax" | "insurance" | "employee-reports";
export type PayrollValue = "gross_pay" | "net_pay" | "payroll_tax" | "employee_insurance" | "employer_insurance" | "other_deductions";
export interface PeopleRow {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  kind: "employees" | "payroll";
  values: Partial<Record<PayrollValue, string>>;
  source_row_id: string;
}
interface PeopleResult {
  manifest_id: string | null;
  status: "available" | "unavailable";
  reason: string | null;
  scope: "imported_personnel" | "imported_payroll";
  items: PeopleRow[];
  totals: Partial<Record<PayrollValue, string>> | null;
}
export const peopleCatalog = {
  employees: { title: "کارمندان", columns: [] },
  payroll: { title: "حقوق و دستمزد", columns: ["gross_pay", "payroll_tax", "employee_insurance", "employer_insurance", "other_deductions", "net_pay"] },
  tax: { title: "مالیات حقوق", columns: ["gross_pay", "payroll_tax"] },
  insurance: { title: "بیمه", columns: ["employee_insurance", "employer_insurance"] },
  "employee-reports": { title: "گزارش کارمندان", columns: ["gross_pay", "payroll_tax", "employee_insurance", "employer_insurance", "other_deductions", "net_pay"] },
} satisfies Record<PeopleKind, { title: string; columns: PayrollValue[] }>;
export const payrollLabels: Record<PayrollValue, string> = {
  gross_pay: "حقوق ناخالص", net_pay: "خالص پرداختنی", payroll_tax: "مالیات حقوق",
  employee_insurance: "بیمه سهم کارمند", employer_insurance: "بیمه سهم کارفرما", other_deductions: "سایر کسورات",
};
export function usePeopleView(kind: PeopleKind) {
  const workspace = useWorkspace();
  const path = workspace.companyPath(kind);
  const resource = useResource<PeopleResult>(path ? `${path}${workspace.periodId ? `?period_id=${encodeURIComponent(workspace.periodId)}` : ""}` : null);
  const [query, setQuery] = useState("");
  const pageScope = `${path}:${workspace.periodId}`;
  const [pagination, setPagination] = useState({ scope: pageScope, page: 0 });
  const page = pagination.scope === pageScope ? pagination.page : 0;
  const setPage = (value: number) => setPagination({ scope: pageScope, page: value });
  const filtered = (resource.data?.items || []).filter(row => `${row.employee_id} ${row.employee_name}`.toLowerCase().includes(query.trim().toLowerCase()));
  const safePage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1));
  const metrics: Metric[] = peopleCatalog[kind].columns.map(key => ({
    metric_key: key, basis: "imported_payroll", value: resource.data?.totals?.[key] ?? null,
    status: resource.data?.totals?.[key] == null ? "unavailable" : "available", unit: "IRR",
    reason_codes: [], reason: "مبلغ این ستون در اسناد موجود نیست.",
  }));
  return { ...resource, metrics, workspace, config: peopleCatalog[kind], query,
    setQuery: (value: string) => { setQuery(value); setPage(0); },
    rows: filtered.slice(safePage * 25, (safePage + 1) * 25), total: filtered.length,
    page: safePage, hasPrevious: safePage > 0, hasNext: (safePage + 1) * 25 < filtered.length,
    previous: () => setPage(safePage - 1), next: () => setPage(safePage + 1),
  };
}
