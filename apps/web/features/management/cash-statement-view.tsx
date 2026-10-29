import { AppIcon } from "@/components/ui/app-icon";
import { financialMetricIcon } from "@/components/ui/financial/metric-icons";

import { Button } from "@/components/ui/button";
import { StatCards, StatCard } from "@/components/ui/financial/stat-cards";
import { EmptyState, StatusMessage } from "@/components/ui/states";
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

export function CashStatementView({
  model,
  onDetails,
}: {
  model: ManagementModel;
  onDetails: (key: string) => void;
}) {
  const cash = model.cashStatement;
  if (!cash)
    return (
      <EmptyState icon="Wallet" title="این نسخه صورت جریان وجوه نقد ندارد" />
    );
  return (
    <div className="space-y-7">
      <p className="text-sm text-muted">
        مبنای دفتری · وجه نقد و معادل‌های نقد
      </p>
      <StatCards>
        {cash.metrics.map((metric) => (
          <StatCard
            icon={financialMetricIcon(metric.key)}
            key={metric.key}
            title={metric.title}
            value={metric.value}
            unit={model.unit}
          >
            {metric.reason ? (
              <p className="text-sm leading-7 text-muted">{metric.reason}</p>
            ) : null}
          </StatCard>
        ))}
      </StatCards>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>فعالیت</TableHead>
            <TableHead>خالص جریان · {model.unit}</TableHead>
            <TableHead>ردیف‌های منبع</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cash.sections.map((section) => (
            <TableRow key={section.key}>
              <TableRowHeader>{section.label}</TableRowHeader>
              <TableCell>
                <bdi className="tabular-nums">{section.value}</bdi>
                {section.reason ? (
                  <div className="mt-2 space-y-1 text-sm leading-7 text-muted">
                    <p>{section.reason}</p>
                    <p>
                      خالص طبقه‌بندی‌شده: <bdi>{section.known}</bdi>
                    </p>
                  </div>
                ) : null}
              </TableCell>
              <TableCell>
                <Button variant="ghost" onClick={() => onDetails(section.key)}>
                  <AppIcon name="Eye" />
                  مشاهده ردیف‌ها
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {cash.hasUnclassified ? (
        <StatusMessage>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              {cash.unclassifiedCount} ردیف نقد بدون طبقه‌بندی · خالص{" "}
              <bdi>{cash.unclassifiedNet}</bdi> {model.unit}
            </p>
            <Button
              variant="secondary"
              onClick={() => onDetails("unclassified")}
            >
              بررسی ردیف‌ها
            </Button>
          </div>
        </StatusMessage>
      ) : null}
      <StatusMessage>{cash.control}</StatusMessage>
    </div>
  );
}
