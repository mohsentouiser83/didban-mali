export const accessModules = [
  { value: "accounting", label: "حسابداری و کدینگ" },
  { value: "treasury", label: "خزانه و چک" },
  { value: "commercial", label: "بازرگانی و طرف حساب‌ها" },
  { value: "inventory", label: "انبار" },
  { value: "periods", label: "دوره‌های مالی" },
  { value: "payroll", label: "حقوق و دستمزد" },
  { value: "reconciliation", label: "تطبیق" },
  { value: "cashflow", label: "جریان نقد و تسویه‌ها" },
  { value: "moadian", label: "مؤدیان" },
  { value: "documents", label: "فایل‌ها و مدارک" },
  { value: "reports", label: "گزارش‌ها" },
  { value: "settings", label: "تنظیمات شرکت" },
  { value: "assistant", label: "دستیار" },
] as const;

export const accessActions = [
  { value: "view", label: "مشاهده" },
  { value: "create", label: "ایجاد" },
  { value: "edit", label: "ویرایش" },
  { value: "delete", label: "حذف" },
] as const;

export type AccessModule = (typeof accessModules)[number]["value"];
export type AccessAction = (typeof accessActions)[number]["value"];
export type ModuleAccess = Partial<Record<AccessModule, Partial<Record<AccessAction, boolean>>>>;

export function moduleAllows(
  company: { module_access?: ModuleAccess } | null | undefined,
  module: AccessModule,
  action: AccessAction,
  defaultAllowed = true,
) {
  return company?.module_access?.[module]?.[action] ?? defaultAllowed;
}

const routeModules: [string, AccessModule][] = [
  ["/settings/accounts", "accounting"],
  ["/settings/treasury", "treasury"],
  ["/settings/periods", "periods"],
  ["/settings/documents", "documents"],
  ["/settings/company", "settings"],
  ["/settings/dimensions", "accounting"],
  ["/settings/numbering", "settings"],
  ["/settings/inventory-units", "inventory"],
  ["/accounting/inventory", "inventory"],
  ["/accounting/period-end", "periods"],
  ["/accounting/cheques", "treasury"],
  ["/accounting", "accounting"],
  ["/commercial", "commercial"],
  ["/receivables", "commercial"],
  ["/payables", "commercial"],
  ["/reconciliation", "reconciliation"],
  ["/moadian", "moadian"],
  ["/payroll", "payroll"],
  ["/employee-reports", "payroll"],
  ["/cashflow", "cashflow"],
  ["/settlements/cheques", "treasury"],
  ["/settlements", "cashflow"],
  ["/reports/processing", "documents"],
  ["/reports", "reports"],
  ["/assistant", "assistant"],
];

export function moduleForPath(path: string) {
  return routeModules.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"))?.[1];
}

export function canViewPath(company: Parameters<typeof moduleAllows>[0], path: string) {
  if (path === "/settlements") {
    return moduleAllows(company, "cashflow", "view") || moduleAllows(company, "treasury", "view");
  }
  const accessModule = moduleForPath(path);
  return !accessModule || moduleAllows(company, accessModule, "view");
}
