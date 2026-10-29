import type { AppIconName } from "../app-icon";

const metricIcons: Record<string, AppIconName> = {
  revenue: "TrendingUp",
  expense: "Coins",
  net_profit: "ChartNoAxesCombined",
  gross_profit: "ChartPie",
  operating_profit: "Activity",
  profit_before_tax: "ChartPie",
  cash: "Wallet",
  ar_ledger: "BookOpen",
  ar_invoice: "ArrowDownLeft",
  ap_trade_ledger: "BookOpen",
  ap_invoice: "ArrowUpRight",
  debt_total_ledger: "ClipboardList",
  ar_difference: "GitCompareArrows",
  ap_difference: "GitCompareArrows",
  opening: "Wallet",
  closing: "Wallet",
  change: "ArrowLeftRight",
  end: "Wallet",
  in: "ArrowDownLeft",
  out: "ArrowUpRight",
  inflow: "ArrowDownLeft",
  outflow: "ArrowUpRight",
  external_inflow: "ArrowDownLeft",
  external_outflow: "ArrowUpRight",
  "external-in": "ArrowDownLeft",
  "external-out": "ArrowUpRight",
  net: "ArrowLeftRight",
  asset: "Wallet",
  liability: "ClipboardList",
  equity: "ChartPie",
  total_assets: "Wallet",
  total_liabilities: "ClipboardList",
  total_equity: "ChartPie",
};

export function financialMetricIcon(key: string): AppIconName {
  return metricIcons[key] ?? "ChartNoAxesCombined";
}
