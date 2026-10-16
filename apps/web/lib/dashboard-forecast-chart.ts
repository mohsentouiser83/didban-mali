import { toPersianDigits } from "@/lib/date-utils";
export type ForecastWeek = {
  week_number: number;
  jalali_range?: string;
  start_date?: string;
  end_date?: string;
  closing_cash_irr?: string | number | null;
  expected_inflow_irr?: string | number | null;
  expected_outflow_irr?: string | number | null;
};
export type ForecastOutlook = {
  weeks?: ForecastWeek[];
  starting_cash_irr?: number | string | null;
  lowest_projected_cash_irr?: number | string | null;
  inflow_coverage_percentage?: number | null;
  first_deficit_week?: number | null;
};


export function prepareForecastChart(weeks: ForecastWeek[]) {
  const data = weeks.map((week) => ({
    ...week,
    calendarLabel: calendarLabel(week),
    inflow: finiteMillions(week.expected_inflow_irr),
    outflow: finiteMillions(week.expected_outflow_irr),
    closing: finiteMillions(week.closing_cash_irr),
  }));
  return data;
}

function finiteMillions(value: string | number | null | undefined) {
  return value == null || (typeof value === "string" && !value.trim()) || !Number.isFinite(Number(value)) ? null : Number(value) / 10_000_000;
}

function calendarLabel(week: ForecastWeek) {
  if (week.start_date) {
    const date = new Date(`${week.start_date}T12:00:00Z`);
    if (Number.isFinite(date.getTime())) return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "short", day: "numeric", timeZone: "Asia/Tehran" }).format(date);
  }
  const start = week.jalali_range?.split(" تا ")[0];
  return start ? toPersianDigits(start.replace(/^\d{4}\//, "")) : `هفته ${toPersianDigits(week.week_number)}`;
}
