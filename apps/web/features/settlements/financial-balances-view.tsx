import Link from "next/link";
import type { Schema } from "@didban/api-client";
import { PageHeader } from "@/features/companies/company-view";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import { StatCards, StatCard } from "@/components/ui/financial/stat-cards";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
export type BalanceRow = {
  id: string;
  number: string;
  party: string;
  due: string;
  gross: string;
  remaining: string;
  reason: string;
  overdue: string;
};
export function BalancesView({
  company,
  title,
  asOf,
  unit,
  metrics,
  rows,
  versions,
  selected,
  onVersion,
}: {
  company: Schema<"Company">;
  title: string;
  asOf: string;
  unit: string;
  metrics: { key: string; title: string; value: string; missing: boolean }[];
  rows: BalanceRow[];
  versions: { value: string; label: string }[];
  selected: string;
  onVersion: (id: string) => void;
}) {
  return (
    <section className="space-y-6 motion-safe:animate-reveal">
      <PageHeader
        title={title}
        description={company.name}
        action={
          <Button asChild variant="secondary">
            <Link href={`/companies/${company.id}/settlements`}>
              دریافت‌وپرداخت
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-full max-w-sm">
          <Field id="balance-version" label="مبنای فایل‌ها">
            <Select
              id="balance-version"
              value={selected}
              onValueChange={onVersion}
              options={versions}
            />
          </Field>
        </div>
        <p className="text-xs text-muted">تا {asOf}</p>
      </div>
      <StatCards>
        {metrics.map((metric) => (
          <StatCard
            key={metric.key}
            title={metric.title}
            value={metric.value}
            unit={unit}
          >
            {metric.missing ? (
              <p className="text-xs text-muted">
                داده معتبر برای این مبنا کافی نیست.
              </p>
            ) : null}
          </StatCard>
        ))}
      </StatCards>
      {!rows.length ? (
        <EmptyState
          title="فاکتوری موجود نیست"
          action={
            <Button asChild>
              <Link href={`/companies/${company.id}/uploads`}>
                تکمیل فایل‌ها
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>فاکتور</TableHead>
                  <TableHead>طرف حساب</TableHead>
                  <TableHead>سررسید</TableHead>
                  <TableHead>مبلغ · {unit}</TableHead>
                  <TableHead>مانده · {unit}</TableHead>
                  <TableHead>وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableRowHeader>
                      <bdi>{row.number}</bdi>
                    </TableRowHeader>
                    <TableCell>
                      <bdi>{row.party}</bdi>
                    </TableCell>
                    <TableCell>{row.due}</TableCell>
                    <TableCell>{row.gross}</TableCell>
                    <TableCell>{row.remaining}</TableCell>
                    <TableCell>
                      {row.reason ? (
                        <p className="max-w-xs text-xs text-muted">
                          {row.reason}
                        </p>
                      ) : (
                        <Badge>{row.overdue}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-4 md:hidden">
            {rows.map((row) => (
              <article
                key={row.id}
                className="space-y-3 rounded-panel border border-border bg-surface p-5"
              >
                <div className="flex justify-between">
                  <h2 className="text-sm font-medium">
                    <bdi>{row.number}</bdi>
                  </h2>
                  <Badge>{row.overdue}</Badge>
                </div>
                <p className="text-xs text-muted">
                  <bdi>{row.party}</bdi> · {row.due}
                </p>
                <p className="text-lg font-medium tabular-nums">
                  {row.remaining} {unit}
                </p>
                {row.reason ? (
                  <p className="text-xs text-muted">{row.reason}</p>
                ) : null}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
