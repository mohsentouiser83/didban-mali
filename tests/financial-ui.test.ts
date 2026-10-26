import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatMoney,
  metricReason,
} from "../apps/web/features/results/presentation";
import type { Schema } from "@didban/api-client";
import { sessionPollingDone } from "../apps/web/features/intake/use-intake";
import {
  sessionLabel,
  financialQuestionText,
} from "../apps/web/features/intake/presentation";
import { canConfigureInterpretation } from "../apps/web/features/interpretation/permissions";

test("financial question display localizes embedded ISO dates without changing wire options", () => {
  const question = {
    question_fa: "پوشش دفتر از 2026-09-01 تا 2026-09-30 چگونه است؟",
    choices: ["declared_complete", "unknown"],
  };
  assert.equal(
    financialQuestionText(question.question_fa),
    "پوشش دفتر از ۱۴۰۵/۰۶/۱۰ تا ۱۴۰۵/۰۷/۰۸ چگونه است؟",
  );
  assert.equal(
    question.question_fa,
    "پوشش دفتر از 2026-09-01 تا 2026-09-30 چگونه است؟",
  );
  assert.deepEqual(question.choices, ["declared_complete", "unknown"]);
  assert.equal(
    financialQuestionText("تاریخ نامعتبر 2026-02-30"),
    "تاریخ نامعتبر 2026-02-30",
  );
});

test("financial results preserve 32-digit amounts and fractional precision", () => {
  assert.equal(
    formatMoney("99999999999999999999999999999991.234560", "IRR"),
    "۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۱٫۲۳۴۵۶",
  );
  assert.equal(
    formatMoney("99999999999999999999999999999991.234560", "IRT"),
    "۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٬۹۹۹٫۱۲۳۴۵۶",
  );
});
test("rial to toman conversion is exact for signed sub-unit amounts and zero", () => {
  assert.equal(formatMoney("-0.000001", "IRT"), "−۰٫۰۰۰۰۰۰۱");
  assert.equal(formatMoney("1", "IRT"), "۰٫۱");
  assert.equal(formatMoney("10", "IRT"), "۱");
  assert.equal(formatMoney("0.00", "IRT"), "۰");
  assert.equal(formatMoney(null, "IRR"), "—");
  assert.notEqual(formatMoney(null, "IRR"), formatMoney("0", "IRR"));
});

test("financial processing continues polling after interpretation and stops at financial snapshot", () => {
  const session = {
    status: "processing",
    interpretation_finished_at: "2026-10-25T10:00:00Z",
    financial_finished_at: null,
    steps: [{ kind: "financial:core" }],
  } as Schema<"ProcessingSession">;
  assert.equal(sessionPollingDone(session), false);
  assert.equal(sessionLabel(session), "در حال محاسبات مالی");
  assert.equal(
    sessionPollingDone({ ...session, status: "waiting_input" }),
    false,
  );
  assert.equal(sessionPollingDone({ ...session, steps: [] }), true);
  const finished = {
    ...session,
    status: "waiting_dependency",
    financial_finished_at: "2026-10-25T10:01:00Z",
  } as Schema<"ProcessingSession">;
  assert.equal(sessionPollingDone(finished), true);
  assert.equal(sessionLabel(finished), "نتایج مالی پایه آماده");
});

test("publication disallows mapping even while the session remains waiting for dependencies", () => {
  const session = {
    status: "waiting_dependency",
    preparation_finished_at: "2026-10-25T10:00:00Z",
    manifest_id: null,
  } as Schema<"ProcessingSession">;
  assert.equal(canConfigureInterpretation(session, true, 1), true);
  assert.equal(
    canConfigureInterpretation(
      { ...session, manifest_id: "published-manifest" },
      true,
      1,
    ),
    false,
  );
  assert.equal(canConfigureInterpretation(session, false, 1), false);
  assert.equal(
    canConfigureInterpretation({ ...session, status: "cancelled" }, true, 1),
    false,
  );
});

test("missing source has one precise local reason instead of cascading dependent warnings", () => {
  const metric = {
    metric_key: "cash",
    reason_codes: ["source_missing", "bank_binding_unknown"],
    coverage: [],
  } as unknown as Schema<"MetricObservation">;
  assert.equal(
    metricReason(metric),
    "گردش بانک بارگذاری نشده؛ مانده نقد محاسبه نشده است.",
  );
});

test("business-stage clarification keeps polling after core metrics have finished", () => {
  const session = {
    status: "waiting_dependency",
    financial_finished_at: "2026-10-25T10:00:00Z",
    analysis_finished_at: null,
    steps: [{ kind: "analysis:domains", status: "pending" }],
  } as Schema<"ProcessingSession">;
  assert.equal(sessionPollingDone(session), false);
  assert.equal(
    sessionPollingDone({ ...session, status: "waiting_input" }),
    false,
  );
  assert.equal(sessionPollingDone({ ...session, status: "cancelled" }), true);
  assert.equal(
    sessionPollingDone({
      ...session,
      analysis_finished_at: "2026-10-25T10:01:00Z",
      steps: [{ ...session.steps[0], status: "limited" }],
    }),
    true,
  );
});

test("report generation keeps polling until all outputs reach a terminal session", () => {
  const session = {
    status: "waiting_dependency",
    analysis_finished_at: "2026-10-25T10:00:00Z",
    report_id: "report-version-id",
    steps: [],
  } as unknown as Schema<"ProcessingSession">;
  assert.equal(sessionPollingDone(session), false);
  assert.equal(sessionLabel(session), "در حال آماده‌سازی خروجی‌ها");
  assert.equal(
    sessionPollingDone({ ...session, status: "waiting_input" }),
    false,
  );
  assert.equal(
    sessionPollingDone({ ...session, status: "completed_limited" }),
    true,
  );
  assert.equal(
    sessionLabel({ ...session, status: "completed_limited" }),
    "گزارش با دامنه محدود آماده",
  );
  assert.equal(sessionPollingDone({ ...session, status: "cancelled" }), true);
});

test("overdue labels distinguish unknown dates and balances from current and settled invoices", async () => {
  const { invoiceOverdue } =
    await import("../apps/web/features/settlements/presentation");
  const invoice = { remaining_as_of: "70", overdue_days: null, due_on: null };
  assert.equal(invoiceOverdue(invoice), "سررسید نامشخص");
  assert.equal(
    invoiceOverdue({ ...invoice, remaining_as_of: null }),
    "مانده نامشخص",
  );
  assert.equal(
    invoiceOverdue({ ...invoice, remaining_as_of: "0.000000" }),
    "تسویه‌شده",
  );
  assert.equal(
    invoiceOverdue({ ...invoice, due_on: "2026-10-10", overdue_days: 0 }),
    "جاری",
  );
  assert.equal(
    invoiceOverdue({ ...invoice, due_on: "2026-09-20", overdue_days: 10 }),
    "۱۰ روز سررسیدگذشته",
  );
});
