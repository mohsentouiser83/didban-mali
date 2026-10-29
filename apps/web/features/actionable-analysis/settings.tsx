"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, message } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import { Form } from "@/components/ui/form";
import { Input, Field, FormMessage } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/ui/states";
type Settings = {
  materiality_ratio: string;
  urgency_days?: number;
  recurrence_count?: number;
  version: number;
};
export function AnalysisSettings({
  company,
  canEdit,
}: {
  company: string;
  canEdit: boolean;
}) {
  const cache = useQueryClient(),
    url = `/api/v1/companies/${company}/analysis-settings`;
  const query = useQuery({
    queryKey: ["analysis-settings", company],
    queryFn: ({ signal }) => api.get<Settings>(url, signal),
  });
  const save = useCommand<
    {
      body: {
        materiality_ratio: string;
        urgency_days: number;
        recurrence_count: number;
        reason: string;
      };
      version: number;
    },
    Settings
  >(
    (v, key) => api.mutate(url, "PUT", v.body, key, v.version),
    async () => {
      await cache.invalidateQueries({
        queryKey: ["analysis-settings", company],
      });
    },
  );
  if (!canEdit) return null;
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        message={message(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <section className="rounded-panel border border-border bg-surface p-5">
      <h2 className="mb-4 font-medium">حساسیت تحلیل</h2>
      <Form
        key={query.data.version}
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save.mutate({
            version: query.data.version,
            body: {
              materiality_ratio: String(f.get("ratio")).trim(),
              reason: String(f.get("reason")).trim(),
              urgency_days: Number(f.get("urgency_days")),
              recurrence_count: Number(f.get("recurrence_count")),
            },
          });
        }}
      >
        <Field id="analysis-ratio" label="نسبت اهمیت به اندازه شرکت">
          <Input
            id="analysis-ratio"
            name="ratio"
            defaultValue={query.data.materiality_ratio}
            type="number"
            min="0.000001"
            max="1"
            step="0.000001"
            required
          />
        </Field>
        <Field id="analysis-setting-reason" label="دلیل تغییر">
          <Input
            id="analysis-setting-reason"
            name="reason"
            required
            maxLength={4000}
          />
        </Field>
        <Field id="analysis-urgency" label="بازه فوریت · روز">
          <Input
            id="analysis-urgency"
            name="urgency_days"
            type="number"
            min="0"
            max="90"
            step="1"
            defaultValue={query.data.urgency_days ?? 7}
            required
          />
        </Field>
        <Field id="analysis-recurrence" label="حداقل دفعات تکرار">
          <Input
            id="analysis-recurrence"
            name="recurrence_count"
            type="number"
            min="2"
            max="12"
            step="1"
            defaultValue={query.data.recurrence_count ?? 2}
            required
          />
        </Field>
        <FormMessage>
          {save.error
            ? message(save.error)
            : save.isSuccess
              ? "تنظیم ثبت شد."
              : undefined}
        </FormMessage>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "در حال ثبت…" : "ذخیره حساسیت"}
        </Button>
      </Form>
    </section>
  );
}
