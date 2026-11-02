export const dimensionKinds = [
  { value: "project", label: "پروژه" },
  { value: "branch", label: "شعبه" },
  { value: "cost_center", label: "مرکز هزینه" },
];
export interface Dimension {
  id: string;
  kind: string;
  code: string;
  name: string;
  active: boolean;
  version: number;
}
export interface DimensionAllocation {
  id: string;
  version: number;
  method: string;
  review_reason: string;
  shares: {
    dimension_id: string;
    percent: string;
    amount: string;
  }[];
}
export interface DimensionLine {
  id: string;
  account: string;
  role: string;
  category: string;
  date: string;
  amount: string;
  source_row_id: string;
  allocation: DimensionAllocation | null;
  allocation_version?: number;
}
export interface DimensionReport {
  period: { name: string; start: string; end: string };
  manifest_id: string | null;
  native_statement_id?: string | null;
  source?: "imported_manifest" | "native_statement";
  kind: string;
  status: string;
  reason: string | null;
  buckets: {
    id: string;
    name: string;
    code: string;
    revenue: string;
    expense: string;
    assigned_net: string;
    profit: string | null;
  }[];
  unassigned: {
    revenue: string;
    expense: string;
    line_count: number;
  };
  lines: DimensionLine[];
}
export interface DimensionRun {
  id: string;
  created_at: string;
  snapshot: DimensionReport;
}
