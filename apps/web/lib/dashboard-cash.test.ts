import { expect, it } from "vitest";
import { dailyCashForecast } from "./dashboard-cash";
import type { CashFlowForecastResponse } from "./product-types";
const forecast = { as_of_date: "2026-10-09", weeks: [{ receipts: [{ due_date: "2026-10-10", amount_irr: "300" }], payments: [{ due_date: "2026-10-11", amount_irr: "1500" }] }] } as CashFlowForecastResponse;
it("calculates end-of-day balances and flows instead of interpolating weekly totals", () => {
  const days = dailyCashForecast(forecast, "1000");
  expect(days).toHaveLength(30);
  expect(days[0]).toMatchObject({ date: "2026-10-09", balance: "100", inflows: "0", outflows: "0" });
  expect(days[1]).toMatchObject({ balance: "130", inflows: "30" });
  expect(days[2]).toMatchObject({ balance: "-20", outflows: "150" });
  expect(days[29]).toMatchObject({ date: "2026-11-07", balance: "-20" });
});
it("preserves exact large rial balances and fractional toman amounts", () => {
  const days = dailyCashForecast({ ...forecast, weeks: [] }, "90071992547409931");
  expect(days[29].balance).toBe("9007199254740993.1");
});
it("includes day 30 payments and excludes movements beyond the selected horizon", () => {
  const days = dailyCashForecast({ ...forecast, weeks: [{ payments: [{ due_date: "2026-11-07", amount_irr: "100" }, { due_date: "2026-11-08", amount_irr: "500" }] }] } as CashFlowForecastResponse, "1000");
  expect(days[28].balance).toBe("100");
  expect(days[29].balance).toBe("90");
});
