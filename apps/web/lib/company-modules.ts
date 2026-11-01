export interface CompanyModule {
  key: string;
  label: string;
  enabled: boolean;
  status: "disabled" | "waiting_sources" | "available" | "not_implemented";
  available: boolean;
  missing_sources: string[][];
  required_sources: string[][];
  version: number;
}
export interface CompanyModules { items: CompanyModule[]; can_manage: boolean }
export const moduleRoutes: Record<string, string> = {
  "/receivables": "receivables", "/payables": "payables",
  "/cashflow": "cashflow", "/cashflow/forecast": "cashflow",
  "/moadian": "moadian", "/settlements": "settlements",
  "/settlements/plans": "settlements", "/reconciliation": "reconciliation",
  "/tax": "employees", "/insurance": "employees", "/payroll": "employees",
  "/employees": "employees", "/employee-reports": "employees",
};
export const moduleStatusLabels = {
  disabled: "خاموش", waiting_sources: "در انتظار اسناد معتبر",
  available: "آماده", not_implemented: "در انتظار تکمیل قابلیت",
};

const sourceLabels: Record<string, string> = { ledger: "دفتر", bank: "بانک", sales: "فروش", purchases: "خرید", settlements: "تسویه", moadian_sales: "فروش مؤدیان", moadian_purchases: "خرید مؤدیان", payroll: "حقوق و دستمزد", employees: "کارمندان" };
export function missingSourceLabels(groups: string[][]) {
  return groups.map(group => group.map(key => sourceLabels[key] || key).join(" یا ")).join("، ");
}
