import Link from "next/link";
import type { Schema } from "@didban/api-client";
import { ArrowRight, FileSearch } from "lucide-react";
import { PageHeader } from "@/features/companies/company-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCards, StatCard } from "@/components/ui/financial/stat-cards";
import { EmptyState, ErrorState } from "@/components/ui/states";

export type MetricCardModel = {
  id: string;
  title: string;
  value: string;
  unit: string;
  status: string;
  tone: "success" | "warning" | "neutral";
  reason: string;
  previous: string | null;
  delta: string | null;
  comparisonReason: string | null;
  coverage: string[];
  evidenceRefs: string[];
  formula: string;
};
export function ResultDetailView({
  company,
  period,
  asOf,
  published,
  manifest,
  metrics,
  missingSources,
  missingModules,
  metricsError,
  onRetry,
  more,
  busy,
  onMore,
  onEvidence,
}: {
  company: Schema<"Company">;
  period: string;
  asOf: string;
  published: string;
  manifest: Schema<"ResultManifest">;
  metrics: MetricCardModel[];
  missingSources: string[];
  missingModules: string[];
  metricsError: string | null;
  onRetry: () => void;
  more: boolean;
  busy: boolean;
  onMore: () => void;
  onEvidence: (metric: MetricCardModel) => void;
}) {
  return (
    <section className="space-y-6 motion-safe:animate-reveal">
      <PageHeader
        title="نتایج مالی"
        description={company.name}
        action={
          <Button asChild variant="ghost">
            <Link href={`/companies/${company.id}/results`}>
              <ArrowRight size={16} aria-hidden />
              همه نسخه‌ها
            </Link>
          </Button>
        }
      />
      <section className="rounded-summary border border-primary/10 bg-linear-to-l from-accent to-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-medium">{period}</h2>
            <p className="mt-2 text-muted">تا {asOf}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="primary">تولیدشده سامانه</Badge>
            <Badge
              tone={manifest.report_scope === "limited" ? "warning" : "success"}
            >
              {manifest.report_scope === "limited"
                ? "دامنه محدود"
                : "دامنه کامل"}
            </Badge>
          </div>
        </div>
        <p className="mt-5 text-xs text-muted">
          زمان تولید این نسخه: {published}
        </p>
        {missingModules.length ? (
          <p className="mt-3 text-xs leading-6 text-muted">
            خارج از محاسبات این نسخه: {missingModules.join("، ")}.
          </p>
        ) : null}
        {missingSources.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-primary/10 pt-4">
            <span className="text-xs text-muted">منابع موجود نیست:</span>
            {missingSources.map((source) => (
              <Badge key={source}>{source}</Badge>
            ))}
            <Button variant="ghost" asChild>
              <Link href={`/companies/${company.id}/uploads`}>
                تکمیل فایل‌ها
              </Link>
            </Button>
          </div>
        ) : null}
      </section>
      {metricsError ? (
        <ErrorState message={metricsError} onRetry={onRetry} />
      ) : null}
      {metrics.length ? (
        <StatCards>
          {metrics.map((metric) => (
            <StatCard
              key={metric.id}
              title={metric.title}
              value={metric.value}
              unit={metric.unit}
              status={<Badge tone={metric.tone}>{metric.status}</Badge>}
            >
              {metric.reason ? (
                <div className="mb-4 space-y-2">
                  <p className="text-xs leading-6 text-muted">
                    {metric.reason}
                  </p>
                  <Button
                    variant="ghost"
                    asChild
                    className="min-h-9 px-0 text-xs"
                  >
                    <Link href={`/companies/${company.id}/uploads`}>
                      بررسی و تکمیل ورودی‌ها
                    </Link>
                  </Button>
                </div>
              ) : null}
              <div className="space-y-2 border-t border-border pt-4 text-xs text-muted">
                {metric.previous !== null ? (
                  <p>
                    دوره قبل:{" "}
                    <bdi className="font-medium tabular-nums">
                      {metric.previous}
                    </bdi>{" "}
                    {metric.unit}
                  </p>
                ) : null}
                {metric.delta !== null ? (
                  <p>
                    تغییر نسبت به دوره قبل:{" "}
                    <bdi className="font-medium tabular-nums">
                      {metric.delta}
                    </bdi>{" "}
                    {metric.unit}
                  </p>
                ) : null}
                {metric.comparisonReason ? (
                  <p className="leading-6">{metric.comparisonReason}</p>
                ) : null}
                <Button
                  variant="ghost"
                  className="w-full justify-start px-0 text-xs"
                  disabled={!metric.evidenceRefs.length}
                  onClick={() => onEvidence(metric)}
                >
                  <FileSearch size={16} aria-hidden />
                  شواهد و پوشش داده
                  <span className="sr-only">{metric.title}</span>
                </Button>
              </div>
            </StatCard>
          ))}
        </StatCards>
      ) : !metricsError ? (
        <EmptyState title="شاخصی برای این نسخه ثبت نشده است" />
      ) : null}
      {more ? (
        <Button variant="secondary" disabled={busy} onClick={onMore}>
          {busy ? "در حال دریافت…" : "شاخص‌های بیشتر"}
        </Button>
      ) : null}
    </section>
  );
}
