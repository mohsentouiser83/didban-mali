import type { CashDay, ForecastAssumption } from "./api";
export interface ScenarioEvent {
  event_id: string;
  date: string;
  direction: "receipt" | "payment";
  amount: string;
  obligation_id?: string;
  label?: string;
  hypothetical?: boolean;
}
export interface FrozenForecast {
  manifest_id: string;
  start: string;
  end: string;
  as_of_date: string;
  opening: string;
  events: ScenarioEvent[];
  assumptions: (string | ForecastAssumption)[];
  policy_version: string;
  accounts: string[];
}
export interface Hypothetical {
  label: string;
  date: string;
  direction: "receipt" | "payment";
  amount: string;
  unit: "IRR" | "TOMAN";
}
export interface ScenarioChanges {
  shifts: { event_id: string; date: string }[];
  hypothetical: Hypothetical[];
}
export interface ScenarioPath {
  opening: string;
  closing: string | null;
  minimum: string | null;
  known_dated_closing?: string;
  known_dated_minimum?: string;
  known_dated_first_deficit?: string | null;
  first_deficit: string | null;
  days: CashDay[];
  excluded_events: ScenarioEvent[];
  events: ScenarioEvent[];
}
export interface CashScenario {
  id: string;
  series_id: string;
  version: number;
  name: string;
  manifest_id: string;
  baseline: FrozenForecast;
  changes: ScenarioChanges;
  comparison: {
    baseline: ScenarioPath;
    scenario: ScenarioPath;
    closing_difference: string | null;
    known_dated_closing_difference?: string;
    projection_scope?: string;
    status: string;
  };
}
export interface ScenarioEvaluation {
  timing_basis?: "out_of_sample" | "retrospective";
  out_of_sample?: boolean;
  status: "available" | "unavailable";
  reason?: string;
  closing_error: string | null;
  days: { date: string; predicted: string; actual: string; error: string }[];
  mean_absolute_balance_error: {
    numerator: string;
    denominator: number;
  } | null;
}
