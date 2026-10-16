import type { DailyCashPoint } from "@/lib/dashboard-cash";
import type { CashFlowForecastResponse } from "@/lib/product-types";
import type { ForecastOutlook } from "@/lib/dashboard-forecast-chart";

export const sampleDailyPoints: DailyCashPoint[] = [
  { date: "2026-10-01", balance: "30000000", inflows: "0", outflows: "0", plot: 30 },
  { date: "2026-10-02", balance: "18000000", inflows: "0", outflows: "12000000", plot: 18 },
  { date: "2026-10-03", balance: "-1000000", inflows: "0", outflows: "19000000", plot: -1 },
];
export const sampleWeeklyForecast: CashFlowForecastResponse = {
  as_of_date: "2026-10-01", scenario: "base", horizon_days: 30, outflow_mode: "planned",
  safety_buffer_irr: "50000000", current_cash_irr: "300000000", total_projected_inflows_irr: "0",
  total_projected_outflows_irr: "310000000", net_period_movement_irr: "-310000000", inflow_sources: [], outflow_sources: [],
  weeks: [
    { week_number: 1, start_date: "2026-10-01", end_date: "2026-10-07", starting_cash_irr: "300000000", projected_inflows_irr: "0", projected_outflows_irr: "120000000", net_change_irr: "-120000000", ending_cash_irr: "180000000", is_deficit: false, deficit_amount_irr: "0", receipts: [], payments: [] },
    { week_number: 2, start_date: "2026-10-08", end_date: "2026-10-14", starting_cash_irr: "180000000", projected_inflows_irr: "0", projected_outflows_irr: "190000000", net_change_irr: "-190000000", ending_cash_irr: "-10000000", is_deficit: true, deficit_amount_irr: "60000000", receipts: [], payments: [] },
  ],
};
export const sampleForecastOutlook: ForecastOutlook = {
  lowest_projected_cash_irr: "-10000000", inflow_coverage_percentage: 60, first_deficit_week: 2,
  weeks: [
    { week_number: 1, start_date: "2026-10-01", end_date: "2026-10-07", closing_cash_irr: "180000000", expected_inflow_irr: "0", expected_outflow_irr: "120000000" },
    { week_number: 2, start_date: "2026-10-08", end_date: "2026-10-14", closing_cash_irr: null, expected_inflow_irr: null, expected_outflow_irr: null },
    { week_number: 3, start_date: "2026-10-15", end_date: "2026-10-21", closing_cash_irr: "-10000000", expected_inflow_irr: "0", expected_outflow_irr: "190000000" },
  ],
};
