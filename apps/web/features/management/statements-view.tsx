import { AppIcon } from "@/components/ui/app-icon";
import { financialMetricIcon } from "@/components/ui/financial/metric-icons";

import { Button } from "@/components/ui/button";
import { StatCards, StatCard } from "@/components/ui/financial/stat-cards";
import { StatusMessage } from "@/components/ui/states";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import type { ManagementModel } from "./presentation";

function StatementRows({
  title,
  lines,
  unit,
  onDetails,
}: {
  title: string;
  lines: ManagementModel["lines"];
  unit: string;
  onDetails: (key: string) => void;
}) {
  return (
    <section className="space-y-4">
      <h2 className="font-heading text-lg font-medium">{title}</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>سرفصل</TableHead>
            <TableHead>مبلغ · {unit}</TableHead>
            <TableHead>جزئیات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.key}>
              <TableRowHeader>{line.label}</TableRowHeader>
              <TableCell>
                <bdi className="tabular-nums">{line.value}</bdi>
                {line.reason ? (
                  <p className="mt-2 text-sm leading-7 text-muted">
                    {line.reason}
                  </p>
                ) : null}
              </TableCell>
              <TableCell>
                <Button variant="ghost" onClick={() => onDetails(line.key)}>
                  <AppIcon name="BookOpen" />
                  حساب‌ها · {line.accountCount}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
export function StatementsView({
  model,
  onDetails,
}: {
  model: ManagementModel;
  onDetails: (key: string) => void;
}) {
  return (
    <div className="space-y-7">
      <StatCards>
        {model.profitTotals.map((t) => (
          <StatCard
            icon={financialMetricIcon(t.key)}
            key={t.key}
            title={t.label}
            value={t.value}
            unit={model.unit}
          >
            {t.reason ? (
              <p className="text-sm leading-7 text-muted">{t.reason}</p>
            ) : null}
          </StatCard>
        ))}
      </StatCards>
      <StatementRows
        title="صورت سود و زیان"
        lines={model.incomeLines}
        unit={model.unit}
        onDetails={onDetails}
      />
      <StatementRows
        title="صورت وضعیت مالی"
        lines={model.balanceLines}
        unit={model.unit}
        onDetails={onDetails}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>جمع</TableHead>
            <TableHead>مبلغ · {model.unit}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {model.balanceTotals.map((t) => (
            <TableRow key={t.key}>
              <TableRowHeader>{t.label}</TableRowHeader>
              <TableCell>
                <bdi>{t.value}</bdi>
                {t.reason ? (
                  <p className="mt-2 text-sm leading-7 text-muted">
                    {t.reason}
                  </p>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <StatusMessage>{model.control}</StatusMessage>
      {model.unmapped ? (
        <StatusMessage>حساب‌های بدون نگاشت: {model.unmapped}</StatusMessage>
      ) : null}
    </div>
  );
}
