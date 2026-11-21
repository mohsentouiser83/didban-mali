export type BlockVisualization =
  | "data_table"
  | "bar_chart"
  | "horizontal_bar"
  | "line_chart"
  | "area_chart"
  | "pie_chart"
  | "donut_chart"
  | "metric_strip";

export interface FieldChoice {
  value: string;
  label: string;
}

export interface FieldRegistryEntry {
  key: string;
  label_fa: string;
  field_type: "string" | "number" | "date" | "select" | "boolean";
  choices: FieldChoice[];
  group: string;
  supported_operators: string[];
}

export interface EntityFieldRegistry {
  entity_type: string;
  title_fa: string;
  filterable: FieldRegistryEntry[];
  selectable: FieldRegistryEntry[];
  groupable: FieldRegistryEntry[];
}

export interface ReportDataSource {
  value: string;
  label_fa: string;
  label_en: string;
  group: string;
  description_fa: string;
}

export interface BlockFilter {
  field: string;
  operator: string;
  value: string | number | boolean | null;
  logic?: "AND" | "OR";
}

export interface MetricDef {
  function: "count" | "sum" | "avg" | "min" | "max";
  field?: string;
  label_fa: string;
  unit?: string;
}

export interface CustomReportBlock {
  id: string;
  title: string;
  entity_type: string;
  visualization: BlockVisualization;
  filters: BlockFilter[];
  columns: string[];
  group_by?: string | null;
  aggregation?: {
    function: "count" | "sum" | "avg" | "min" | "max";
    field?: string | null;
  };
  metrics?: MetricDef[];
  width: 4 | 6 | 8 | 12;
}

export interface BlockResultColumn {
  key: string;
  label_fa: string;
  type: string;
}

export interface BlockResult {
  entity_type: string;
  visualization: BlockVisualization;
  columns: BlockResultColumn[];
  rows: Record<string, unknown>[];
  total: number;
  chart_data: {
    labels: string[];
    datasets: Array<{ label: string; data: number[] }>;
  };
  metrics: Array<{ label_fa: string; value: number; unit?: string }>;
  error?: string;
}

export const VISUALIZATION_LABELS: Record<BlockVisualization, string> = {
  data_table: "جدول داده‌ها",
  bar_chart: "نمودار میله‌ای عمودی",
  horizontal_bar: "نمودار میله‌ای افقی",
  line_chart: "نمودار خطی روند",
  area_chart: "نمودار مساحتی",
  pie_chart: "نمودار دایره‌ای",
  donut_chart: "نمودار دونات",
  metric_strip: "نوار شاخص‌های کلیدی (KPI)",
};

export const OPERATOR_LABELS: Record<string, string> = {
  "=": "برابر است با",
  "!=": "مخالف است با",
  ">": "بزرگتر از",
  "<": "کوچکتر از",
  ">=": "بزرگتر یا مساوی",
  "<=": "کوچکتر یا مساوی",
  contains: "شامل عبارت",
  in: "در بین گزینه‌ها",
  between: "بین بازه",
  today: "امروز",
  this_month: "این ماه",
  is_null: "خالی است",
  is_not_null: "دارای مقدار است",
};
