"use client";
import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api, message } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import { useCompany, useAccess } from "@/features/companies/use-companies";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { notify } from "@/components/ui/sonner";
import { formatDate, persianDigits } from "@/lib/dates";
import {
  PolicyView,
  PolicyForm,
  PolicyDetails,
  type PolicyRow,
} from "./policy-view";
const kinds: Record<string, string> = {
  upload: "بارگذاری",
  forecast: "پیش‌بینی",
  financial: "محاسبات مالی",
  interpretation: "تفسیر داده",
  matching: "تطبیق",
  retry: "تلاش دوباره",
};
const labels: Record<string, string> = {
  minimum_events: "حداقل سابقه",
  lookback_days: "بازه سابقه · روز",
  delay_method: "روش برآورد تأخیر",
  max_files: "تعداد فایل",
  max_data_rows: "ردیف غیرخالی",
  max_file_bytes: "حجم فایل · بایت",
  max_expanded_bytes: "حجم بازشده · بایت",
};
export function PolicyController() {
  const { companyId } = useParams<{ companyId: string }>(),
    company = useCompany(companyId),
    access = useAccess(companyId),
    cache = useQueryClient();
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState<PolicyRow | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["policies", companyId],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"PolicyPage">>(
        `/api/v1/companies/${companyId}/policies?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  });
  const save = useCommand<Schema<"PolicySettingsRequest">, Schema<"Policy">>(
    (body, key) =>
      api.mutate(`/api/v1/companies/${companyId}/policies`, "POST", body, key),
    async () => {
      setOpen(false);
      await cache.invalidateQueries({ queryKey: ["policies", companyId] });
      notify.success("نسخه سیاست ثبت شد.");
    },
  );
  const submit = (
    e: FormEvent<HTMLFormElement>,
    kind: "upload" | "forecast",
  ) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const common = {
      effective_from: String(f.get("effective_from")),
      reason: String(f.get("reason")).trim(),
    };
    if (kind === "forecast")
      save.mutate({
        ...common,
        kind,
        parameters: {
          minimum_events: Number(f.get("minimum_events")),
          lookback_days: Number(f.get("lookback_days")),
          delay_method: "amount_weighted_median",
        },
      });
    else
      save.mutate({
        ...common,
        kind,
        parameters: {
          max_files: Number(f.get("max_files")),
          max_data_rows: Number(f.get("max_data_rows")),
          max_file_bytes: Number(f.get("max_file_bytes")),
          max_expanded_bytes: Number(f.get("max_expanded_bytes")),
        },
      });
  };
  if (company.isPending || access.isPending || query.isPending)
    return <LoadingState layout="table" />;
  if (company.error || access.error || query.error)
    return (
      <ErrorState
        message={message(company.error || access.error || query.error)}
        onRetry={() => {
          void company.refetch();
          void access.refetch();
          void query.refetch();
        }}
      />
    );
  const rows: PolicyRow[] = query.data.pages
    .flatMap((p) => p.items)
    .map((p) => ({
      id: p.id,
      kind: kinds[p.kind] ?? p.kind,
      version: persianDigits(String(p.version)),
      effective: formatDate(p.effective_from),
      status:
        p.validation_status === "proposed"
          ? "پیشنهادی"
          : p.validation_status === "evaluated"
            ? "کنترل‌شده"
            : "تأییدشده",
      parameters: Object.entries(p.parameters)
        .filter(([k]) => labels[k])
        .map(([k, v]) => ({
          label: labels[k],
          value:
            k === "delay_method"
              ? "میانه وزنی بر اساس مبلغ"
              : persianDigits(String(v)),
        })),
    }));
  return (
    <>
      <PolicyView
        company={company.data.name}
        rows={rows}
        canManage={access.data.permissions.includes("company.financial_policy")}
        onCreate={() => {
          save.reset();
          setOpen(true);
        }}
        onInspect={setSelected}
        more={query.hasNextPage}
        busy={query.isFetchingNextPage}
        onMore={() => {
          void query.fetchNextPage();
        }}
      />
      {open ? (
        <PolicyForm
          busy={save.isPending}
          error={save.error ? message(save.error) : null}
          onClose={() => setOpen(false)}
          onSubmit={submit}
        />
      ) : null}
      {selected ? (
        <PolicyDetails row={selected} onClose={() => setSelected(null)} />
      ) : null}
    </>
  );
}
