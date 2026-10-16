import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useWeeklyCashChart } from "./use-weekly-cash-chart";
import { sampleWeeklyForecast } from "@/components/design-system/chart-state-samples";

it("keeps axis domains finite when there are no weeks", () => {
  const { result } = renderHook(() => useWeeklyCashChart({ ...sampleWeeklyForecast, weeks: [] }));
  expect(Number.isFinite(result.current.lower)).toBe(true);
  expect(Number.isFinite(result.current.upper)).toBe(true);
  expect(result.current.selected).toBeUndefined();
});
it("keeps a negative selected cash balance distinct from the safety threshold", () => {
  const { result } = renderHook(() => useWeeklyCashChart(sampleWeeklyForecast));
  expect(result.current.selected.ending_cash_irr).toBe("-10000000");
  expect(result.current.buffer).toBe(5);
});
