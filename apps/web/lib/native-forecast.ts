import type { CashDay } from "./api";
export interface NativeForecastQuestion {
  id: string;
  key: string;
  title: string;
  reason_code: string;
  amount: string;
  reference: string;
  as_of: string;
  kind?: "choice";
}
export interface NativeForecastRun {
  id: string;
  digest: string;
  native_statement_id: string;
  projection?: {
    status: "estimated" | "limited";
    closing: string | null;
    minimum: string | null;
    first_deficit: string | null;
    known_dated_closing?: string;
    known_dated_minimum?: string;
    projection_scope: string;
  };
  snapshot: {
    status: "estimated" | "limited";
    as_of: string;
    start: string;
    end: string;
    opening: string;
    closing: string | null;
    minimum: string | null;
    known_dated_closing?: string;
    known_dated_minimum?: string;
    projection_scope?: "known_dated_flows" | "declared_complete_obligations";
    first_deficit: string | null;
    days: CashDay[];
    events: {
      event_id: string;
      date: string;
      direction: "receipt" | "payment";
      amount: string;
      obligation_id: string;
    }[];
    reason_codes: string[];
    assumptions: {
      basis: string;
      delay_days?: number;
      history_event_count?: number;
    }[];
  };
}
export interface NativeForecastPlan {
  id: string;
  version: number;
  state: string;
  native_statement_id: string;
  questions: NativeForecastQuestion[];
  forecast: NativeForecastRun | null;
  snapshot: { as_of: string };
  forecast_run_id: string | null;
}
export const nativeForecastReasons: Record<string, string> = {
  receipt_date_unknown: "زمان وصول برخی فاکتورها نامعلوم است.",
  payment_date_unknown: "زمان پرداخت برخی تعهدها نامعلوم است.",
  future_obligations_not_declared_complete:
    "کامل بودن تعهدهای آینده تأیید نشده است.",
  native_invoice_balance_unavailable: "ماندهٔ برخی فاکتورها قابل محاسبه نیست.",
  manual_plan_invoice_link_unknown:
    "ارتباط برخی برنامه‌های پرداخت با فاکتورها نامعلوم است.",
  receipt_history_insufficient:
    "سه رویداد وصول معتبر در ۱۸۰ روز گذشته موجود نیست.",
  invoice_due_date_missing: "سررسید فاکتور مشخص نیست.",
  receipt_history_ambiguous: "تاریخچه وصول یک مرجع یکتا ندارد.",
  receipt_estimate_in_past: "تاریخ برآوردی وصول گذشته است.",
  payment_date_missing: "تاریخ پرداخت مشخص نیست.",
  payment_estimate_in_past: "تاریخ پرداخت گذشته است.",
};
