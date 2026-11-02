"use client";
import { useState } from "react";
import type { Metric } from "@/lib/api";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
function todayInTehran() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (key: string) => parts.find((part) => part.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function defaultCutoff(period?: { start: string; end: string }) {
  const today = todayInTehran();
  return period?.start && period.end
    ? today < period.start
      ? period.start
      : today > period.end
        ? period.end
        : today
    : today;
}
const REASONS: Record<string, string> = {
  opening_evidence_missing: "سند افتتاحیه مشخص نشده؛ مانده قابل محاسبه نیست.",
  opening_evidence_ambiguous:
    "مبنای افتتاحیه یکتا نیست؛ مانده قابل محاسبه نیست.",
  opening_source_not_closed:
    "دوره مبدأ باز شده؛ مبنای افتتاحیه نیازمند بررسی است.",
  opening_journal_changed: "سند افتتاحیه تغییر کرده؛ مانده نیازمند بررسی است.",
  opening_journal_invalid: "سند افتتاحیه معتبر نیست؛ مانده قابل محاسبه نیست.",
  opening_journal_reversed: "سند افتتاحیه برگشت شده؛ مانده قابل محاسبه نیست.",
  opening_source_changed:
    "اسناد دوره مبدأ تغییر کرده‌اند؛ افتتاحیه نیازمند بررسی است.",
  opening_scope_incomplete: "همه مانده‌های مبدأ منتقل نشده‌اند.",
  nominal_balance_not_closed: "حساب‌های سود و زیان مبدأ بسته نشده‌اند.",
  opening_account_roles_invalid: "نقش حساب‌های افتتاحیه کامل یا معتبر نیست.",
  unclassified_profit_accounts:
    "نقش بعضی حساب‌ها مشخص نیست؛ سود و زیان کامل نیست.",
  unclassified_balance_accounts: "نقش بعضی حساب‌ها مشخص نیست؛ مانده کامل نیست.",
  period_accounting_role_conflict:
    "نقش حساب با سند پایان یا آغاز دوره سازگار نیست.",
};
interface NativeMetric extends Metric {
  known_subset_value: string | null;
}
interface Statement {
  period_id: string;
  period?: { name: string };
  metrics: NativeMetric[];
  items: {
    account_id: string;
    party_id: string;
    code: string;
    name: string;
    role: string | null;
    debit: string;
    credit: string;
    period_movement: string;
    cumulative_balance: string | null;
  }[];
  journal_ids: string[];
  as_of: string;
}
interface StatementRun {
  digest: string;
  can_approve: boolean;
  approvals: { id: string; actor_name: string; created_at: string }[];
  id: string;
  created_at: string;
  snapshot: Statement;
}
interface StatementSummary extends Omit<StatementRun, "snapshot"> {
  summary_only: true;
  snapshot: Pick<Statement, "period_id" | "period" | "as_of">;
}
export function useNativeStatements() {
  const workspace = useWorkspace();
  const base = workspace.companyPath("accounting/statements");
  const [period, setPeriod] = useState(
    workspace.periodId || workspace.periods[0]?.id || "",
  );
  const [asOf, setAsOf] = useState(() =>
    period
      ? defaultCutoff(workspace.periods.find((item) => item.id === period))
      : "",
  );
  const [run, setRun] = useState<StatementRun | null>(null);
  const preview = useResource<Statement>(
    base && period && asOf
      ? base + `/preview?period_id=${period}${asOf ? `&as_of=${asOf}` : ""}`
      : null,
  );
  const history = usePagedResource<StatementSummary>(base);
  const command = useCommand();
  const [approving, setApproving] = useState(false);
  const statement = run?.snapshot || preview.data;
  const [page, setPage] = useState(0);
  const rows = statement?.items || [];
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / 25) - 1),
  );
  function save() {
    if (!period || !asOf) return;
    void command.run<StatementRun>(
      base,
      { body: { period_id: period, ...(asOf ? { as_of: asOf } : {}) } },
      (item) => {
        setRun(item);
        history.refresh();
      },
      "نسخه ثابت صورت مالی ذخیره شد.",
    );
  }
  return {
    approving,
    setApproving,
    approve: () => {
      if (!run) return;
      void command.run<StatementRun["approvals"][number]>(
        base + `/${run.id}/approvals`,
        { body: { digest: run.digest } },
        (approval) => {
          setRun({
            ...run,
            can_approve: false,
            approvals: [...(run.approvals || []), approval],
          });
          setApproving(false);
          history.refresh();
        },
        "نسخهٔ ثابت صورت مالی تأیید شد.",
      );
    },
    workspace,
    asOf,
    setAsOf: (value: string) => {
      setAsOf(value);
      setRun(null);
      setPage(0);
    },
    period,
    setPeriod: (value: string) => {
      setPeriod(value);
      const selected = workspace.periods.find((item) => item.id === value);
      setAsOf(defaultCutoff(selected));
      setRun(null);
      setPage(0);
    },
    run,
    preview,
    history,
    command,
    statement,
    save,
    selectRun: (item: StatementRun | StatementSummary) => {
      const select = (full: StatementRun) => {
        setRun(full);
        setPeriod(full.snapshot.period_id);
        setAsOf(full.snapshot.as_of);
        setPage(0);
      };
      if ("summary_only" in item && item.summary_only) {
        void command.run<StatementRun>(
          base + `/${item.id}`,
          { method: "GET" },
          select,
        );
      } else select(item as StatementRun);
    },
    showLive: () => setRun(null),
    metrics: (statement?.metrics || [])
      .filter((metric) =>
        [
          "revenue",
          "expense",
          "profit_before_tax",
          "bank_balance",
          "trade_receivable_balance",
          "trade_payable_balance",
        ].includes(metric.metric_key),
      )
      .map((metric) => ({
        ...metric,
        basis: "native_book",
        reason: metric.reason_codes
          .map((code) => REASONS[code] || "مبنای این شاخص نیازمند تکمیل است.")
          .join(" "),
      })),
    rows: rows.slice(currentPage * 25, currentPage * 25 + 25),
    page: currentPage,
    total: rows.length,
    setPage,
    downloadBase: run
      ? `/api/v1/companies/${workspace.company?.id}/accounting/statements/${run.id}/export`
      : null,
  };
}
