export type StudioEntityType =
  | "invoices"
  | "ledger"
  | "parties"
  | "cheques"
  | "payroll"
  | "inventory"
  | "dimensions";

export type StudioWidgetType =
  | "kpi_card"
  | "line_chart"
  | "bar_chart"
  | "donut_chart"
  | "data_table"
  | "ai_summary";

export type StudioLayoutType =
  | "grid-1"
  | "grid-2"
  | "grid-3"
  | "grid-4"
  | "split-2-1"
  | "split-1-2";

export interface StudioGlobalFilters {
  period_id: string;
  date_from?: string | null;
  date_to?: string | null;
  basis: "all" | "ledger" | "invoice" | "bank";
  dimension_id?: string | null;
  unit: "IRR" | "TOMAN";
}

export interface StudioWidgetFilters {
  direction: "all" | "sales" | "purchases";
  party_id?: string | null;
  overdue_only: boolean;
  status?: string | null;
  category?: string | null;
}

export interface StudioWidgetSpec {
  id: string;
  title: string;
  type: StudioWidgetType;
  entity: StudioEntityType;
  metric: string;
  group_by: "none" | "month" | "direction" | "status" | "party" | "category";
  limit: number;
  filters: StudioWidgetFilters;
  unit: "IRR" | "TOMAN";
  color?: string;
  col_span?: number;
}

export type StudioBasisType =
  | "all"
  | "ledger"
  | "invoice"
  | "bank"
  | "cheques"
  | "payroll"
  | "inventory";

export interface StudioSectionSpec {
  id: string;
  title: string;
  description?: string | null;
  layout: StudioLayoutType;
  basis?: StudioBasisType;
  widgets: StudioWidgetSpec[];
}

export interface StudioLayoutSpec {
  title: string;
  description: string;
  global_filters: StudioGlobalFilters;
  sections: StudioSectionSpec[];
}

export interface RenderedWidget extends StudioWidgetSpec {
  data: Record<string, unknown> | unknown[] | null;
}

export interface RenderedSection {
  id: string;
  title: string;
  description?: string | null;
  layout: StudioLayoutType;
  basis?: StudioBasisType;
  widgets: RenderedWidget[];
}

export interface StudioPreviewResult {
  title: string;
  description: string;
  company_name: string;
  period: {
    id: string;
    name: string;
    start: string;
    end: string;
  };
  global_filters: StudioGlobalFilters;
  sections: RenderedSection[];
  as_of?: string;
  basis_label?: string;
}

export interface StudioDefinition {
  system_key?: string | null;
  can_delete?: boolean;
  id: string;
  name: string;
  version: number;
  created_at?: string;
  is_dashboard?: boolean;
  spec: StudioLayoutSpec;
}

export interface ActiveDashboardResponse {
  has_custom_dashboard: boolean;
  mode?: "fixed" | "live" | "legacy";
  definition_id?: string | null;
  definition_name?: string | null;
  spec?: StudioLayoutSpec | null;
  dashboard?: StudioPreviewResult | null;
  error?: string | null;
}

export const ENTITY_OPTIONS: { value: StudioEntityType; label: string }[] = [
  { value: "invoices", label: "فاکتورهای خرید و فروش" },
  { value: "ledger", label: "دفتر کل و اسناد مالی" },
  { value: "parties", label: "طرف‌حساب‌ها و بدهکاران/بستانکاران" },
  { value: "cheques", label: "بانک و چک‌های صیادی" },
  { value: "payroll", label: "حقوق و دستمزد پرسنل" },
  { value: "inventory", label: "انبار و گردش کالا" },
  { value: "dimensions", label: "ابعاد و مراکز هزینه" },
];

export const WIDGET_TYPE_OPTIONS: { value: StudioWidgetType; label: string }[] = [
  { value: "kpi_card", label: "کارت شاخص کلیدی (KPI Card)" },
  { value: "line_chart", label: "نمودار روندی خطی (Line Trend)" },
  { value: "bar_chart", label: "نمودار میله‌ای مقایسه‌ای (Bar Chart)" },
  { value: "donut_chart", label: "نمودار سهم و ترکیب (Donut Chart)" },
  { value: "data_table", label: "جدول داده‌ای تفصیلی (Data Grid)" },
  { value: "ai_summary", label: "باکس تحلیل هوشمند هوش مصنوعی (AI Insight)" },
];

export const LAYOUT_OPTIONS: { value: StudioLayoutType; label: string }[] = [
  { value: "grid-1", label: "یک ستونه (عرض کامل)" },
  { value: "grid-2", label: "دو ستونه مساوی (۵۰٪ - ۵۰٪)" },
  { value: "grid-3", label: "سه ستونه مساوی (۳۳٪)" },
  { value: "grid-4", label: "چهار ستونه (کارت‌های شاخص)" },
  { value: "split-2-1", label: "دو سوم و یک سوم (۶۶٪ - ۳۳٪)" },
  { value: "split-1-2", label: "یک سوم و دو سوم (۳۳٪ - ۶۶٪)" },
];

export const BASIS_OPTIONS: { value: StudioBasisType; label: string }[] = [
  { value: "all", label: "تمام منابع مالی" },
  { value: "ledger", label: "فقط اسناد دفتری" },
  { value: "invoice", label: "فقط فاکتورها" },
  { value: "bank", label: "فقط بانک و چک" },
  { value: "cheques", label: "چک‌های صیادی" },
  { value: "payroll", label: "حقوق و دستمزد" },
  { value: "inventory", label: "انبار و کالا" },
];

export function createDefaultStudioSpec(periodId: string, unit: "IRR" | "TOMAN" = "IRR"): StudioLayoutSpec {
  return {
    title: "گزارش جدید",
    description: "نمای ماژولار از شاخص‌ها، نمودارها و وضعیت مالی",
    global_filters: {
      period_id: periodId,
      basis: "all",
      unit,
    },
    sections: [
      {
        id: "sec-kpis",
        title: "شاخص‌های کلیدی",
        description: "خلاصه کلان عملکرد دوره جاری",
        layout: "grid-4",
        widgets: [
          {
            id: `w-${Date.now()}-1`,
            title: "درآمد دوره",
            type: "kpi_card",
            entity: "ledger",
            metric: "revenue",
            group_by: "none",
            limit: 8,
            unit,
            color: "emerald",
            filters: { direction: "all", overdue_only: false },
          },
          {
            id: `w-${Date.now()}-2`,
            title: "هزینه‌های عملیاتی",
            type: "kpi_card",
            entity: "ledger",
            metric: "expense",
            group_by: "none",
            limit: 8,
            unit,
            color: "rose",
            filters: { direction: "all", overdue_only: false },
          },
          {
            id: `w-${Date.now()}-3`,
            title: "مجموع فروش فاکتوری",
            type: "kpi_card",
            entity: "invoices",
            metric: "sales_total",
            group_by: "none",
            limit: 8,
            unit,
            color: "primary",
            filters: { direction: "sales", overdue_only: false },
          },
          {
            id: `w-${Date.now()}-4`,
            title: "مطالبات سررسیدگذشته",
            type: "kpi_card",
            entity: "invoices",
            metric: "sales_overdue",
            group_by: "none",
            limit: 8,
            unit,
            color: "amber",
            filters: { direction: "sales", overdue_only: true },
          },
        ],
      },
      {
        id: "sec-charts",
        title: "روند درآمد و ترکیب هزینه‌ها",
        description: "مقایسه ماهانه درآمد و هزینه و سهم دسته‌بندی‌ها",
        layout: "grid-2",
        widgets: [
          {
            id: `w-${Date.now()}-5`,
            title: "روند درآمد در برابر هزینه",
            type: "bar_chart",
            entity: "ledger",
            metric: "revenue_vs_expense",
            group_by: "month",
            limit: 12,
            unit,
            color: "primary",
            filters: { direction: "all", overdue_only: false },
          },
          {
            id: `w-${Date.now()}-6`,
            title: "سهم گروه‌های هزینه",
            type: "donut_chart",
            entity: "ledger",
            metric: "expense",
            group_by: "category",
            limit: 6,
            unit,
            filters: { direction: "all", overdue_only: false },
          },
        ],
      },
    ],
  };
}
