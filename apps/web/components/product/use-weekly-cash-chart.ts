"use client";
import { useState } from "react";
import type { CashFlowForecastResponse } from "@/lib/product-types";

function millions(value: string) {
  return value.trim() && Number.isFinite(Number(value)) ? Number(value) / 10_000_000 : null;
}

export function useWeeklyCashChart(forecast: CashFlowForecastResponse, baseline?: CashFlowForecastResponse | null) {
  const [selectedNumber, setSelectedNumber] = useState(
    () =>
      (forecast.weeks.find((week) => Number(week.ending_cash_irr) < 0) ?? forecast.weeks.find((week) => week.is_deficit) ?? forecast.weeks[0])
        ?.week_number,
  );
  const selected =
    forecast.weeks.find((week) => week.week_number === selectedNumber) ??
    forecast.weeks[0];
  const selectedIndex = forecast.weeks.findIndex(
    (week) => week.week_number === selected?.week_number,
  );
  const firstDeficit = forecast.weeks.find((week) => week.is_deficit);
  const data = forecast.weeks.map((week) => ({
    ...week,
    balance: millions(week.ending_cash_irr),
  }));
  const buffer = millions(forecast.safety_buffer_irr);
  const [fullScale, setFullScale] = useState(true);
  const horizonLabel = forecast.horizon_days === 30 ? "یک ماه آینده" : "سه ماه آینده";
  const balances = data.map((week) => week.balance).filter((value): value is number => value != null);
  const minimum = balances.length ? Math.min(...balances) : 0;
  const maximum = balances.length ? Math.max(...balances) : 0;
  const padding = Math.max((maximum - minimum) * 0.15, Math.abs(maximum) * 0.02, 1);
  const lower = minimum - padding;
  const upper = maximum + padding;
  const thresholdOutside = buffer != null && (buffer < lower || buffer > upper);
  const lowestWeek = forecast.weeks.reduce((lowest, week) => Number(week.ending_cash_irr) < Number(lowest.ending_cash_irr) ? week : lowest, forecast.weeks[0]);
  const baseWeek = baseline?.as_of_date === forecast.as_of_date && baseline.safety_buffer_irr === forecast.safety_buffer_irr && baseline.horizon_days === forecast.horizon_days && baseline.outflow_mode === forecast.outflow_mode ? baseline.weeks.find((week) => week.week_number === selected?.week_number) : undefined;
  const assumptions = forecast.scenario === "pessimistic" ? "ضریب احتمال وصول: ۰٫۷۰ · ضریب مصرف: ۱٫۱۰" : forecast.scenario === "optimistic" ? "ضریب احتمال وصول: ۱٫۱۵ · ضریب مصرف: ۰٫۹۵" : "ضریب احتمال وصول: ۱٫۰۰ · ضریب مصرف: ۱٫۰۰";
  const calendarTick = (weekNumber: number) => {
    const week = forecast.weeks.find((item) => item.week_number === weekNumber);
    return week ? new Intl.DateTimeFormat("fa-IR", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${week.end_date}T12:00:00Z`)) : "";
  };
  return { selected, selectedIndex, setSelectedNumber, firstDeficit, data, buffer, fullScale, setFullScale, horizonLabel, lower, upper, thresholdOutside, lowestWeek, baseWeek, assumptions, calendarTick };
}
