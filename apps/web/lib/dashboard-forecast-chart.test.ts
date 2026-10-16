import { describe, expect, it } from "vitest";
import { prepareForecastChart } from "./dashboard-forecast-chart";

describe("forecast chart data", () => {
  it("preserves a missing-data gap separately from zero and negative cash", () => {
    const result = prepareForecastChart([
      { week_number: 1, closing_cash_irr: "0", expected_inflow_irr: "0" },
      { week_number: 2, closing_cash_irr: null, expected_inflow_irr: null },
      { week_number: 3, closing_cash_irr: "-10000000", expected_outflow_irr: "10000000" },
    ]);
    expect(result.map((week) => week.closing)).toEqual([0, null, -1]);
    expect(result.map((week) => week.inflow)).toEqual([0, null, null]);
  });
});
