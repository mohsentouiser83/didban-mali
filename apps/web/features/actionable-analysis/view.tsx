"use client";
import { metricLabels, formatMoney } from "@/features/results/presentation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input, Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
export type SourceReference = {
  input_values?: Record<string, string | null>;
  calculated_value?: string | null;
  metric_key?: string;
  file_name: string;
  sheet_name?: string;
  row_number?: number;
  description?: string;
  rule_key?: string;
  fact_values?: string[];
  source_row_id?: string;
};
export type EvidenceSelection = { ids: string[]; refs: SourceReference[] };
export type Proposal = {
  id: string;
  report_id: string;
  axis: string;
  followup: string;
  version: number;
  content: {
    title: string;
    status: string;
    explanation: string;
    action: string;
    limitations: string[];
    priority: string;
    evidence: {
      metric_key: string;
      value: string;
      evidence_ids: string[];
      source_refs?: SourceReference[];
    }[];
    priority_components: Record<string, string>;
  };
};
const statuses = [
  { value: "unreviewed", label: "بررسی‌نشده" },
  { value: "in_progress", label: "در حال پیگیری" },
  { value: "done", label: "انجام‌شده" },
  { value: "rejected", label: "ردشده" },
];
export function AnalysisProposalView({
  item,
  canEdit,
  busy,
  error,
  onSave,
  onEvidence,
}: {
  onEvidence: (selection: EvidenceSelection) => void;
  item: Proposal;
  canEdit: boolean;
  busy: boolean;
  error?: string;
  onSave: (status: string, reason: string) => void;
}) {
  return (
    <article className="rounded-panel border border-border bg-surface p-5 space-y-4 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">{item.content.title}</h2>
        <Badge>
          {item.content.status === "unavailable"
            ? "داده کافی نیست"
            : item.content.priority === "high"
              ? "اولویت بالا"
              : "عادی"}
        </Badge>
      </div>
      <p className="text-sm text-muted">{item.content.explanation}</p>
      <p>{item.content.action}</p>
      {item.content.evidence.map((e) => (
        <p key={e.metric_key} className="text-sm tabular-nums">
          {metricLabels[e.metric_key] ?? "شاخص"}: {formatMoney(e.value, "IRR")}{" "}
          ریال
        </p>
      ))}
      {item.axis !== "payroll" &&
      item.content.evidence.some(
        (e) => e.evidence_ids.length || e.source_refs?.length,
      ) ? (
        <Button
          variant="secondary"
          onClick={() =>
            onEvidence({
              ids: [
                ...new Set(
                  item.content.evidence
                    .filter((e) => !e.source_refs?.length)
                    .flatMap((e) => e.evidence_ids),
                ),
              ],
              refs: item.content.evidence.flatMap((e) => e.source_refs ?? []),
            })
          }
        >
          شواهد
        </Button>
      ) : null}
      {item.content.limitations.length > 0 ? (
        <p className="text-sm text-muted">
          {item.axis === "payroll"
            ? "نتیجه حقوق تأییدشده در این نسخه گزارش موجود نیست."
            : `اطلاعات معتبر این شاخص‌ها موجود نیست: ${item.content.limitations.map((k) => metricLabels[k] ?? "پوشش منبع").join("، ")}`}
        </p>
      ) : null}
      <details>
        <summary className="cursor-pointer text-sm text-primary">
          دلیل اولویت
        </summary>
        <p className="mt-3 text-sm text-muted">
          نسبت مبلغِ مسئله به مقیاس شرکت:{" "}
          {item.content.priority_components.relative_size}؛ آستانه:{" "}
          {item.content.priority_components.threshold}
        </p>
      </details>
      {canEdit ? (
        <Followup
          key={item.version}
          item={item}
          busy={busy}
          error={error}
          onSave={onSave}
        />
      ) : (
        <Badge>{statuses.find((s) => s.value === item.followup)?.label}</Badge>
      )}
      {item.followup === "done" ? (
        <p className="text-sm text-muted">
          انجام اقدام ثبت شده؛ رفع مسئله هنوز تأیید نشده است.
        </p>
      ) : null}
    </article>
  );
}
function Followup({
  item,
  busy,
  error,
  onSave,
}: {
  item: Proposal;
  busy: boolean;
  error?: string;
  onSave: (s: string, r: string) => void;
}) {
  const [status, setStatus] = useState(item.followup);
  return (
    <Form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSave(status, String(f.get("reason") ?? "").trim());
      }}
    >
      <Select
        id={`status-${item.id}`}
        label="وضعیت پیگیری"
        value={status}
        onValueChange={setStatus}
        options={statuses}
      />
      <Field
        id={`reason-${item.id}`}
        label={status === "rejected" ? "دلیل رد" : "یادداشت پیگیری"}
      >
        <Input
          id={`reason-${item.id}`}
          name="reason"
          required={status === "rejected"}
          maxLength={4000}
        />
      </Field>
      <FormMessage>{error}</FormMessage>
      <Button type="submit" disabled={busy}>
        {busy ? "در حال ثبت…" : "ثبت پیگیری"}
      </Button>
    </Form>
  );
}
import { useState } from "react";
