"use client";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api, message } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { formatCanonical } from "@/features/interpretation/format-values";
import { choiceLabels, fields } from "@/features/interpretation/labels";
import { InputReviewView } from "./input-review-view";

export function InputReviewController({
  companyId,
  sessionId,
}: {
  companyId: string;
  sessionId: string;
}) {
  const base = `/api/v1/companies/${companyId}/processing-sessions/${sessionId}/input-review`;
  const cache = useQueryClient();
  const [target, setTarget] = useState("general");
  const [body, setBody] = useState("");
  const query = useQuery({
    queryKey: ["input-review", companyId, sessionId],
    queryFn: ({ signal }) => api.get<Schema<"InputReview">>(base, signal),
    refetchInterval: (q) =>
      q.state.data?.proposals.some((p) => p.status === "pending")
        ? 1500
        : false,
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({
        queryKey: ["input-review", companyId, sessionId],
      }),
      cache.invalidateQueries({ queryKey: ["session", companyId, sessionId] }),
      cache.invalidateQueries({ queryKey: ["sessions", companyId] }),
    ]);
  };
  const comment = useCommand<
    Schema<"InputReviewCommentRequest">,
    Schema<"InputReview">
  >(
    (value, cmd) =>
      api.mutate(
        base + "/comments",
        "POST",
        value,
        cmd,
        query.data?.session_version,
      ),
    async () => {
      setBody("");
      await refresh();
    },
  );
  const command = useCommand<
    { suffix: string; body: unknown },
    Schema<"InputReview">
  >(
    (value, cmd) =>
      api.mutate(
        base + value.suffix,
        "POST",
        value.body,
        cmd,
        query.data?.session_version,
      ),
    refresh,
  );
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!body.trim() || !query.data) return;
    const account =
      target === "general"
        ? undefined
        : query.data.overview.accounts[Number(target)];
    const sheetTargets = query.data.overview.files.flatMap((f) =>
      f.sheets.map((sheet_name) => ({ file_id: f.file_id, sheet_name })),
    );
    const sheet = target.startsWith("sheet:")
      ? sheetTargets[Number(target.slice(6))]
      : undefined;
    comment.mutate({
      snapshot_hash: query.data.snapshot_hash,
      body: body.trim(),
      file_id: account?.file_id ?? sheet?.file_id ?? null,
      sheet_name: account?.sheet_name ?? sheet?.sheet_name ?? null,
      account_code: account?.account_code ?? null,
    });
  };
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        message={message(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  const data = query.data;
  const labels: Record<string, string> = {
    ledger: "دفتر",
    trial_balance: "تراز آزمایشی",
    bank: "بانک",
    sales_invoices: "فروش",
    purchase_invoices: "خرید",
    settlements: "تسویه",
    moadian_sales: "فروش مؤدیان",
    moadian_purchases: "خرید مؤدیان",
    planned_payments: "برنامه پرداخت",
    receipt_history: "تاریخچه وصول",
  };
  const proposalLabels: Record<string, string> = {
    pending: "در حال بررسی نظر",
    proposed: "پیشنهاد آماده بررسی",
    ambiguous: "نیازمند توضیح بیشتر",
    unavailable: "پیشنهاد دریافت نشد",
    usage_unknown: "وضعیت پاسخ نامشخص",
    accepted: "اصلاح پذیرفته شد",
    rejected: "پیشنهاد رد شد",
    stale: "نسخه تغییر کرده است",
  };
  const reason = (content: Schema<"InputReviewCorrection">["content"]) =>
    content && typeof content.reason === "string" ? content.reason : "";
  return (
    <InputReviewView
      companyId={companyId}
      data={data}
      reportChecks={[
        {
          label: "گزارش‌های دفتری",
          detail: data.overview.source_kinds.some((k) =>
            ["ledger", "trial_balance"].includes(k),
          )
            ? "منبع موجود؛ وابسته به پوشش، ثبت‌ها و افتتاحیه"
            : "نیازمند دفتر یا تراز",
        },
        {
          label: "مانده و گردش بانک",
          detail: data.overview.source_kinds.includes("bank")
            ? "گردش موجود؛ مانده نیازمند مبنای معتبر"
            : "نیازمند گردش بانک",
        },
        {
          label: "مانده و سررسید فاکتورها",
          detail: data.overview.source_kinds.some((k) =>
            ["sales_invoices", "purchase_invoices"].includes(k),
          )
            ? "منبع موجود؛ وابسته به تسویه و سررسید"
            : "نیازمند فاکتور و اطلاعات تسویه",
        },
        {
          label: "تطبیق بانک و دفتر",
          detail: ["bank", "ledger"].every((k) =>
            data.overview.source_kinds.includes(k),
          )
            ? "منابع مقایسه موجود است"
            : "نیازمند دفتر و گردش بانک",
        },
      ]}
      samples={data.overview.samples.map((row) => ({
        ...row,
        values: row.values
          .filter(
            (v) =>
              fields[v.field] &&
              ![
                "source_role",
                "role_provenance",
                "role_controls_passed",
                "record_role",
              ].includes(v.field),
          )
          .map((v) => ({
            field: v.field,
            label: fields[v.field],
            value:
              [
                "entry_type",
                "direction",
                "row_type",
                "kind",
                "flow_basis",
                "cashflow_activity",
              ].includes(v.field) && v.value !== null
                ? (choiceLabels[v.value] ?? "نامشخص")
                : formatCanonical(v.field, v.value),
          })),
      }))}
      files={data.overview.files.map((f) => ({
        ...f,
        kinds: f.source_kinds.map((k) => labels[k] ?? k).join("، "),
      }))}
      proposals={data.proposals.map((p) => ({
        ...p,
        label: proposalLabels[p.status] ?? "نامشخص",
        reason: reason(p.content),
        change:
          p.content?.action === "set_account_role"
            ? `${String(p.content.account_code)}: ${choiceLabels[String(p.content.before_role)] ?? "نامشخص"} ← ${choiceLabels[String(p.content.role)] ?? "نامشخص"}`
            : p.content?.action === "set_column_mapping" &&
                p.content.mapping &&
                typeof p.content.mapping === "object"
              ? `شیت ${String(p.content.sheet_name)} · ` +
                Object.entries(p.content.mapping)
                  .map(
                    ([field, column]) =>
                      `${fields[field] ?? field}: ${p.content?.before_mapping && typeof p.content.before_mapping === "object" && field in p.content.before_mapping ? "ستون " + String((p.content.before_mapping as Record<string, unknown>)[field]) : "نگاشت نشده"} ← ستون ${String(column)}`,
                  )
                  .join("، ")
              : undefined,
      }))}
      options={[
        { value: "general", label: "نظر کلی درباره فایل‌ها" },
        ...data.overview.files
          .flatMap((f) =>
            f.sheets.map((sheet_name) => ({
              file_id: f.file_id,
              sheet_name,
              name: f.name,
            })),
          )
          .map((sheet, i) => ({
            value: `sheet:${i}`,
            label: `${sheet.name} · ${sheet.sheet_name}`,
          })),
        ...data.overview.accounts.map((a, i) => ({
          value: String(i),
          label: `${a.account_code} · ${a.account_name}`,
        })),
      ]}
      target={target}
      onTarget={setTarget}
      body={body}
      onBody={setBody}
      onSubmit={submit}
      busy={comment.isPending || command.isPending}
      onRefresh={() => {
        void query.refetch();
        comment.reset();
        command.reset();
      }}
      error={
        comment.error || command.error
          ? message(comment.error || command.error)
          : undefined
      }
      onConfirm={() =>
        command.mutate({
          suffix: "/confirm",
          body: { snapshot_hash: data.snapshot_hash },
        })
      }
      onPropose={(id) =>
        command.mutate({
          suffix: "/proposals",
          body: { comment_id: id, snapshot_hash: data.snapshot_hash },
        })
      }
      onResolve={(id) =>
        command.mutate({
          suffix: `/comments/${id}/resolve`,
          body: { reason: "نظر بررسی شد؛ اصلاحی لازم نیست." },
        })
      }
      onDecision={(id, accept) =>
        command.mutate({
          suffix: `/proposals/${id}/decision`,
          body: {
            accept,
            reason: accept
              ? "اصلاح پیشنهادی بررسی و پذیرفته شد."
              : "پیشنهاد با نظر کاربر سازگار نیست.",
          },
        })
      }
    />
  );
}
