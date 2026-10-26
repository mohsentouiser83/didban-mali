import Link from "next/link";
import type { ReactNode } from "react";
import type { Schema } from "@didban/api-client";
import type { FinancialChartData } from "@/components/ui/financial/chart-data";
import {
  FinancialChart,
  ChartTooltip,
} from "@/components/ui/financial/financial-chart";
import { StatCards, StatCard } from "@/components/ui/financial/stat-cards";
import { PageHeader } from "@/features/companies/company-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Field, Input, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/states";
export type ForecastDayModel = {
  date: string;
  opening: string;
  incoming: string;
  outgoing: string;
  closing: string;
  status: string;
  reason: string;
};
export function ForecastView({
  company,
  manifest,
  manifests,
  onManifest,
  run,
  runs,
  onRun,
  asOf,
  status,
  unit,
  metrics,
  chart,
  day,
  dayOptions,
  selectedDay,
  onDay,
  onDetails,
  dayOpen,
  onCloseDay,
  assumptions,
  pending,
  questions,
  canStart,
  onStart,
}: {
  company: Schema<"Company">;
  manifest: string;
  manifests: { value: string; label: string }[];
  onManifest: (id: string) => void;
  run: string;
  runs: { value: string; label: string }[];
  onRun: (id: string) => void;
  asOf: string;
  status: string;
  unit: string;
  metrics: { title: string; value: string; detail?: string }[];
  chart: FinancialChartData;
  day: ForecastDayModel | null;
  dayOptions: { value: string; label: string }[];
  selectedDay: string;
  onDay: (value: string) => void;
  onDetails: () => void;
  dayOpen: boolean;
  onCloseDay: () => void;
  assumptions: string[];
  pending: boolean;
  questions: ReactNode;
  canStart: boolean;
  onStart: () => void;
}) {
  return (
    <section className="space-y-6 motion-safe:animate-reveal">
      <PageHeader
        title="پیش‌بینی ۳۰روزه"
        description={company.name}
        action={
          canStart ? (
            <Button onClick={onStart}>پیش‌بینی تازه</Button>
          ) : undefined
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="forecast-manifest" label="مبنای فایل‌ها">
          <Select
            id="forecast-manifest"
            value={manifest}
            onValueChange={onManifest}
            options={manifests}
          />
        </Field>
        {runs.length ? (
          <Field id="forecast-run" label="نسخه پیش‌بینی">
            <Select
              id="forecast-run"
              value={run}
              onValueChange={onRun}
              options={runs}
            />
          </Field>
        ) : null}
      </div>
      {questions}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">برآورد از پایان {asOf}</p>
        <Badge>{status}</Badge>
      </div>
      {pending ? (
        <EmptyState title="پیش‌بینی منتظر پاسخ است" />
      ) : !run ? (
        <EmptyState title="نسخه پیش‌بینی موجود نیست" />
      ) : (
        <>
          <StatCards>
            {metrics.map((m) => (
              <StatCard
                key={m.title}
                title={m.title}
                value={m.value}
                unit={unit}
              >
                {m.detail ? (
                  <p className="text-xs text-muted">{m.detail}</p>
                ) : null}
              </StatCard>
            ))}
          </StatCards>
          <section className="space-y-5 rounded-panel border border-border bg-surface p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-medium">مسیر مانده نقد</h2>
              <Button asChild variant="ghost">
                <Link href={`/companies/${company.id}/cashflow`}>
                  گزارش دوره
                </Link>
              </Button>
            </div>
            {chart.points.length ? (
              <FinancialChart
                label="مانده برآوردی سی روز آینده"
                data={chart}
                selectedIndex={Number(selectedDay)}
              />
            ) : (
              <EmptyState title="مانده پیش‌بینی قابل محاسبه نیست" />
            )}
            {day ? (
              <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-full max-w-xs">
                    <Field id="forecast-day" label="روز مورد بررسی">
                      <Select
                        id="forecast-day"
                        value={selectedDay}
                        onValueChange={onDay}
                        options={dayOptions}
                      />
                    </Field>
                  </div>
                  <Button variant="secondary" onClick={onDetails}>
                    جزئیات روز
                  </Button>
                </div>
                <ChartTooltip label="مقدار دقیق روز انتخاب‌شده">
                  <p>
                    {day.date} · مانده {day.closing} {unit}
                  </p>
                </ChartTooltip>
              </>
            ) : null}
          </section>
          {assumptions.length ? (
            <section className="space-y-3 rounded-panel border border-border bg-surface p-5">
              <h2 className="text-sm font-medium">فرض‌ها و محدودیت‌ها</h2>
              <ul className="space-y-2 text-xs leading-6 text-muted">
                {assumptions.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      {day ? (
        <Dialog
          open={dayOpen}
          onOpenChange={(v) => {
            if (!v) onCloseDay();
          }}
          title={day.date}
        >
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <dt className="text-muted">مانده آغاز روز</dt>
            <dd>
              {day.opening} {unit}
            </dd>
            <dt className="text-muted">دریافت مورد انتظار</dt>
            <dd>
              {day.incoming} {unit}
            </dd>
            <dt className="text-muted">پرداخت مورد انتظار</dt>
            <dd>
              {day.outgoing} {unit}
            </dd>
            <dt className="text-muted">مانده پایان روز</dt>
            <dd>
              {day.closing} {unit}
            </dd>
          </dl>
          {day.reason ? (
            <p className="mt-5 text-xs leading-6 text-muted">{day.reason}</p>
          ) : null}
        </Dialog>
      ) : null}
    </section>
  );
}
export function ForecastStartDialog({
  open,
  onClose,
  onSubmit,
  busy,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
      title="فرض‌های برآورد وصول"
    >
      <Form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
      >
        <Field id="forecast-minimum" label="حداقل تعداد سابقه هر مشتری">
          <Input
            id="forecast-minimum"
            name="minimum_events"
            type="number"
            min={1}
            max={10000}
            defaultValue="3"
            required
          />
        </Field>
        <Field id="forecast-lookback" label="پنجره سابقه · روز">
          <Input
            id="forecast-lookback"
            name="lookback_days"
            type="number"
            min={1}
            max={3650}
            defaultValue="180"
            required
          />
        </Field>
        {error ? <FormMessage>{error}</FormMessage> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "در حال ثبت…" : "اعمال فرض‌ها و آغاز"}
        </Button>
      </Form>
    </Dialog>
  );
}
