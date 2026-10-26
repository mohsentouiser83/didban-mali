import { Download, FileCheck, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
import { EmptyState, StatusMessage } from "@/components/ui/states";
import { StatCards, StatCard } from "@/components/ui/financial/stat-cards";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
export type ReportModel = {
  id: string;
  edition: string;
  date: string;
  period: string;
  limited: boolean;
  approved: boolean;
  unit: string;
  sourceCount: string;
  forecast: string;
  metrics: {
    key: string;
    label: string;
    value: string;
    state: string;
    reason: string;
  }[];
  exports: {
    id: string;
    label: string;
    status: string;
    ready: boolean;
    failed: boolean;
    url: string;
  }[];
};
export function ReportsView({
  company,
  backHref,
  manifestOptions,
  manifestId,
  onManifest,
  reportOptions,
  reportId,
  onReport,
  report,
  canOperate,
  canApprove,
  generating,
  approving,
  retrying,
  error,
  approvalError,
  approvalOpen,
  onApprovalOpen,
  onGenerate,
  onApprove,
  onRetry,
  more,
  onMore,
}: {
  company: string;
  backHref?: string;
  manifestOptions: { value: string; label: string }[];
  manifestId: string;
  onManifest: (value: string) => void;
  reportOptions: { value: string; label: string }[];
  reportId: string;
  onReport: (value: string) => void;
  report: ReportModel | null;
  canOperate: boolean;
  canApprove: boolean;
  generating: boolean;
  approving: boolean;
  retrying: boolean;
  error: string | null;
  approvalError: string | null;
  approvalOpen: boolean;
  onApprovalOpen: (value: boolean) => void;
  onGenerate: () => void;
  onApprove: () => void;
  onRetry: (id: string) => void;
  more: boolean;
  onMore: () => void;
}) {
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-[26px] font-medium">
            گزارش‌ها و خروجی‌ها
          </h1>
          <p className="mt-2 text-sm text-muted">{company}</p>
        </div>
        {backHref ? (
          <Button asChild variant="secondary">
            <a href={backHref}>همه گزارش‌ها</a>
          </Button>
        ) : null}
        {canOperate ? (
          <Button onClick={onGenerate} disabled={!manifestId || generating}>
            <FileText size={17} aria-hidden />
            {generating ? "در حال آماده‌سازی…" : "تولید گزارش"}
          </Button>
        ) : null}
      </header>
      <section className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="report-manifest">مبنای فایل‌ها</label>
          <Select
            id="report-manifest"
            label="مبنای فایل‌ها"
            value={manifestId}
            onValueChange={onManifest}
            options={manifestOptions}
            disabled={!!backHref}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="report-edition">نسخه گزارش</label>
          <Select
            id="report-edition"
            label="نسخه گزارش"
            value={reportId}
            onValueChange={onReport}
            options={reportOptions}
            disabled={!!backHref}
          />
        </div>
      </section>
      {error ? <StatusMessage>{error}</StatusMessage> : null}
      {!report ? (
        <EmptyState title="گزارشی آماده نیست" />
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-summary border border-border bg-surface p-5 sm:p-7">
            <div className="space-y-2">
              <h2 className="font-heading text-lg font-medium">
                {report.period}
              </h2>
              <p className="text-xs text-muted">
                {report.edition} · {report.date}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge tone="neutral">تولیدشده سامانه</Badge>
                <Badge tone={report.limited ? "warning" : "success"}>
                  {report.limited ? "پوشش محدود" : "آماده"}
                </Badge>
                <Badge tone={report.approved ? "success" : "neutral"}>
                  {report.approved
                    ? "تأیید مسئول مالی ثبت شده"
                    : "بدون تأیید مسئول مالی"}
                </Badge>
              </div>
            </div>
            {canApprove && !report.approved ? (
              <Button
                variant="secondary"
                onClick={() => onApprovalOpen(true)}
                disabled={approving}
              >
                <FileCheck size={17} aria-hidden />
                تأیید این نسخه
              </Button>
            ) : null}
          </section>
          <StatCards>
            {report.metrics
              .filter((m) =>
                ["revenue", "expense", "net_profit"].includes(m.key),
              )
              .map((m) => (
                <StatCard
                  key={m.key}
                  title={m.label}
                  value={m.value}
                  unit={report.unit}
                >
                  {m.reason ? (
                    <p className="text-xs leading-6 text-muted">{m.reason}</p>
                  ) : null}
                </StatCard>
              ))}
          </StatCards>
          <section className="space-y-4">
            <h2 className="text-sm font-medium">فایل‌های این نسخه</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {report.exports.map((e) => (
                <article
                  key={e.id}
                  className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">{e.label}</h3>
                    <Badge
                      tone={
                        e.failed ? "warning" : e.ready ? "success" : "neutral"
                      }
                    >
                      {e.status}
                    </Badge>
                  </div>
                  {e.ready ? (
                    <Button asChild variant="secondary">
                      <a href={e.url}>
                        <Download size={17} aria-hidden />
                        دانلود
                      </a>
                    </Button>
                  ) : e.failed && canOperate ? (
                    <Button
                      variant="secondary"
                      disabled={retrying}
                      onClick={() => onRetry(e.id)}
                    >
                      تلاش دوباره
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
          <section className="space-y-4">
            <h2 className="text-sm font-medium">
              شاخص‌های همان نسخه · {report.unit}
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>شاخص</TableHead>
                  <TableHead>مقدار</TableHead>
                  <TableHead>وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.metrics.map((m) => (
                  <TableRow key={m.key}>
                    <TableRowHeader>{m.label}</TableRowHeader>
                    <TableCell>
                      <bdi className="tabular-nums">{m.value}</bdi>
                    </TableCell>
                    <TableCell>
                      <span>{m.state}</span>
                      {m.reason ? (
                        <p className="mt-1 text-xs leading-6 text-muted">
                          {m.reason}
                        </p>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
          <p className="text-xs text-muted">
            {report.sourceCount} فایل مبنا · مانده برآوردی پایان ۳۰ روز:{" "}
            {report.forecast} {report.unit}
          </p>
        </>
      )}
      {more ? (
        <Button variant="secondary" onClick={onMore}>
          گزارش‌های بیشتر
        </Button>
      ) : null}
      <Dialog
        open={approvalOpen}
        onOpenChange={onApprovalOpen}
        title="تأیید این نسخه گزارش"
        busy={approving}
      >
        <FormMessage>{approvalError}</FormMessage>
        <p className="mb-6 leading-7">
          تأیید مسئول مالی برای همین نسخه ثبت می‌شود.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onApprove} disabled={approving}>
            {approving ? "در حال ثبت…" : "ثبت تأیید"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onApprovalOpen(false)}
            disabled={approving}
          >
            انصراف
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
