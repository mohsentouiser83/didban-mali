import { rial, toman } from "./cashflow-amounts";
import type { CashFlowForecastResponse } from "./product-types";

export type DailyCashPoint = { date: string; balance: string; inflows: string; outflows: string; plot: number };
export function dailyCashForecast(forecast: CashFlowForecastResponse, openingCash: string): DailyCashPoint[] {
  const inflows = new Map<string, bigint>();
  const outflows = new Map<string, bigint>();
  for (const week of forecast.weeks) {
    for (const movement of week.receipts ?? []) inflows.set(movement.due_date, (inflows.get(movement.due_date) ?? BigInt(0)) + rial(movement.amount_irr));
    for (const movement of week.payments ?? []) outflows.set(movement.due_date, (outflows.get(movement.due_date) ?? BigInt(0)) + rial(movement.amount_irr));
  }
  let cash = rial(openingCash);
  return Array.from({ length: 30 }, (_, index) => {
    const day = new Date(`${forecast.as_of_date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    const incoming = inflows.get(date) ?? BigInt(0);
    const outgoing = outflows.get(date) ?? BigInt(0);
    cash += incoming - outgoing;
    const balance = toman(cash.toString());
    // Only the chart coordinates use floating point; displayed amounts stay exact.
    return { date, balance, inflows: toman(incoming.toString()), outflows: toman(outgoing.toString()), plot: Number(balance) / 1_000_000 };
  });
}
