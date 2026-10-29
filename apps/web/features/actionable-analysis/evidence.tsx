"use client";
import { evidenceInputValue } from "./evidence-values";
import { metricLabels, formatMoney } from "@/features/results/presentation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api, message } from "@/lib/api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { persianDigits } from "@/lib/dates";
import type { EvidenceSelection } from "./view";
const fieldLabels: Record<string, string> = {
  date: "تاریخ",
  issued_on: "تاریخ صدور",
  due_on: "سررسید",
  account: "حساب",
  bank_account: "حساب بانکی",
  entry_id: "شماره سند",
  debit: "بدهکار",
  credit: "بستانکار",
  amount: "مبلغ",
  gross: "مبلغ کل",
  unit: "واحد محاسبه",
  original_unit: "واحد اصل فایل",
  row_type: "نوع ردیف",
  role: "نقش حساب",
};
export function AnalysisEvidence({
  company,
  selection,
  onClose,
}: {
  company: string;
  selection: EvidenceSelection;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<number | null>(null),
    [page, setPage] = useState(0),
    size = 10;
  const { ids, refs } = selection,
    total = ids.length + refs.length,
    id = chosen !== null && chosen < ids.length ? ids[chosen] : "",
    ref =
      chosen !== null && chosen >= ids.length
        ? refs[chosen - ids.length]
        : undefined;
  const q = useQuery({
    queryKey: ["evidence", company, id],
    enabled: !!id,
    queryFn: ({ signal }) =>
      api.get<Schema<"Evidence">>(
        `/api/v1/companies/${company}/evidence/${id}`,
        signal,
      ),
  });
  return (
    <Dialog
      title="شواهد پیشنهاد"
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {chosen === null ? (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            {persianDigits(String(total))} شاهد
          </p>
          <div className="grid gap-2">
            {Array.from(
              { length: Math.min(size, total - page * size) },
              (_, i) => page * size + i,
            ).map((index) => (
              <Button
                key={index}
                variant="secondary"
                onClick={() => setChosen(index)}
              >
                {index >= ids.length
                  ? `${refs[index - ids.length].file_name} · ${refs[index - ids.length].sheet_name ?? "برگه"} · ردیف ${persianDigits(String(refs[index - ids.length].row_number ?? ""))}`
                  : `مشاهده شاهد ${persianDigits(String(index + 1))}`}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              قبلی
            </Button>
            <Button
              variant="ghost"
              disabled={(page + 1) * size >= total}
              onClick={() => setPage(page + 1)}
            >
              بعدی
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => setChosen(null)}>
            بازگشت به فهرست شواهد
          </Button>
          {ref ? (
            <div className="space-y-3">
              <p className="font-medium">{ref.file_name}</p>
              <p className="text-sm text-muted">
                {ref.sheet_name} · ردیف{" "}
                {persianDigits(String(ref.row_number ?? ""))}
              </p>
              <p>{ref.description || "محاسبه از ردیف‌های همین بازه گزارش"}</p>
              <dl className="grid gap-2">
                {Object.entries(ref.input_values ?? {})
                  .filter(([, v]) => v !== null)
                  .map(([key, value]) => (
                    <div
                      key={key}
                      className="flex flex-wrap justify-between gap-3"
                    >
                      <dt className="text-sm text-muted">
                        {fieldLabels[key] ?? key}
                      </dt>
                      <dd className="text-sm tabular-nums">
                        {evidenceInputValue(key, value)}
                      </dd>
                    </div>
                  ))}
              </dl>
              {ref.calculated_value !== null &&
              ref.calculated_value !== undefined ? (
                <p className="text-sm">
                  نتیجه {metricLabels[ref.metric_key ?? ""] ?? "شاخص"} در این
                  نسخه: {formatMoney(ref.calculated_value, "IRR")} ریال
                </p>
              ) : null}

              {ref.fact_values?.length ? (
                <p className="text-sm tabular-nums">
                  مقادیر محاسبه:{" "}
                  {ref.fact_values
                    .map((value) => persianDigits(value))
                    .join("، ")}
                </p>
              ) : null}
            </div>
          ) : q.isPending ? (
            <LoadingState />
          ) : q.error ? (
            <ErrorState
              message={message(q.error)}
              onRetry={() => void q.refetch()}
            />
          ) : (
            <div className="space-y-3">
              <p>{q.data.description_fa}</p>
              <p className="text-sm text-muted">
                {q.data.sheet_name ? `برگه: ${q.data.sheet_name}` : ""}
                {q.data.row_number
                  ? ` · ردیف ${persianDigits(String(q.data.row_number))}`
                  : ""}
              </p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
