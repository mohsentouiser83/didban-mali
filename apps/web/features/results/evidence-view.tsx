import { AppIcon } from "@/components/ui/app-icon";
import type { Schema } from "@didban/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ErrorState, LoadingState } from "@/components/ui/states";
import type { MetricCardModel } from "./result-detail-view";

export function EvidenceView({
  metric,
  evidence,
  loading,
  error,
  index,
  facts,
  row,
  onClose,
  onIndex,
  onRetry,
}: {
  metric: MetricCardModel;
  evidence?: Schema<"Evidence">;
  loading: boolean;
  error: string | null;
  index: number;
  facts: string[];
  row: string | null;
  onClose: () => void;
  onIndex: (index: number) => void;
  onRetry: () => void;
}) {
  return (
    <Dialog
      icon="FileSearch"
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`شواهد ${metric.title}`}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {metric.coverage.map((coverage, index) => (
            <Badge key={index}>{coverage}</Badge>
          ))}
        </div>
        <p className="text-xs text-muted">
          نسخه فرمول: <bdi>{metric.formula}</bdi>
        </p>
        {loading ? (
          <LoadingState layout="compact" label="در حال دریافت شاهد" />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : evidence ? (
          <section className="space-y-4 rounded-panel border border-border p-4">
            <p className="leading-7">{evidence.description_fa}</p>
            {evidence.sheet_name || row ? (
              <p className="text-xs text-muted">
                {evidence.sheet_name ? `برگه: ${evidence.sheet_name}` : null}
                {row ? ` · ردیف: ${row}` : null}
              </p>
            ) : null}
            {evidence.source_file_id ? (
              <p className="break-all text-xs text-muted">
                شناسه فایل: <bdi>{evidence.source_file_id}</bdi>
              </p>
            ) : null}
            {facts.length ? (
              <div>
                <h3 className="flex items-center gap-2 mb-2 text-xs font-medium">
                  <AppIcon name="FileSearch" className="text-primary" />
                  مقادیر شاهد · {metric.unit}
                </h3>
                <ul className="space-y-2">
                  {facts.map((fact, i) => (
                    <li key={i} className="break-all tabular-nums">
                      <bdi>{fact}</bdi>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="break-all text-xs text-muted">
              قاعده: <bdi>{evidence.rule_key}</bdi>
            </p>
          </section>
        ) : null}
        {metric.evidenceRefs.length > 1 ? (
          <nav
            aria-label="مرور شواهد"
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <Button
              variant="secondary"
              disabled={index === 0}
              onClick={() => onIndex(index - 1)}
            >
              <AppIcon name="ChevronRight" />
              قبلی
            </Button>
            <span className="text-xs text-muted">
              {rowCount(index + 1)} از {rowCount(metric.evidenceRefs.length)}
            </span>
            <Button
              variant="secondary"
              disabled={index + 1 >= metric.evidenceRefs.length}
              onClick={() => onIndex(index + 1)}
            >
              <AppIcon name="ChevronLeft" />
              بعدی
            </Button>
          </nav>
        ) : null}
      </div>
    </Dialog>
  );
}

function rowCount(value: number) {
  return value.toLocaleString("fa-IR");
}
