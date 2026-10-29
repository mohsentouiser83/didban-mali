import { AppIcon } from "@/components/ui/app-icon";
import { financialMetricIcon } from "@/components/ui/financial/metric-icons";

import { CalendarDays, List } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatCards, StatCard } from "@/components/ui/financial/stat-cards";
import { StatusMessage, EmptyState } from "@/components/ui/states";
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

export function DailyView({
  model,
  day,
  onDay,
  onDetails,
  showForecast,
}: {
  model: ManagementModel;
  day: ManagementModel["days"][number] | undefined;
  onDay: (date: string) => void;
  onDetails: (kind: string) => void;
  showForecast: boolean;
}) {
  if (!day)
    return (
      <EmptyState icon="CalendarRange" title="روزی در این بازه موجود نیست" />
    );
  return (
    <div className="space-y-7">
      <div className="max-w-sm space-y-2">
        <label htmlFor="management-day" className="flex items-center gap-2">
          <CalendarDays size={17} aria-hidden />
          روز گزارش
        </label>
        <Select
          id="management-day"
          label="روز گزارش"
          value={day.date}
          onValueChange={onDay}
          options={model.days.map((d) => ({ value: d.date, label: d.label }))}
        />
      </div>
      <StatCards>
        {day.metrics.map((m) => (
          <StatCard
            icon={financialMetricIcon(m.key)}
            key={m.key}
            title={m.title}
            value={m.value}
            unit={model.unit}
          >
            {m.key === "expense" && day.expenseReason ? (
              <p className="text-sm leading-7 text-muted">
                {day.expenseReason}
              </p>
            ) : null}
          </StatCard>
        ))}
      </StatCards>
      {day.reason ? <StatusMessage>{day.reason}</StatusMessage> : null}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => onDetails("cash")}>
          <List size={17} aria-hidden />
          گردش بانک · {day.movementCount}
        </Button>
        <Button variant="secondary" onClick={() => onDetails("expenses")}>
          <AppIcon name="FileSearch" />
          اسناد هزینه
        </Button>
      </div>
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-heading text-lg font-medium">
          <AppIcon name="CalendarRange" className="text-primary" />
          دریافت و پرداخت برآوردی ۷ روز آینده
        </h2>
        {showForecast && model.upcoming.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>روز</TableHead>
                <TableHead>دریافت · {model.unit}</TableHead>
                <TableHead>پرداخت</TableHead>
                <TableHead>مانده برآوردی</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.upcoming.map((d) => (
                <TableRow key={d.date}>
                  <TableRowHeader>{d.date}</TableRowHeader>
                  <TableCell>{d.incoming}</TableCell>
                  <TableCell>{d.outgoing}</TableCell>
                  <TableCell>{d.closing}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <StatusMessage>
            {showForecast
              ? model.upcomingReason
              : "پیش‌بینی تاریخی این روز موجود نیست."}
          </StatusMessage>
        )}
        {showForecast && model.upcoming.length && model.upcomingReason ? (
          <StatusMessage>{model.upcomingReason}</StatusMessage>
        ) : null}
      </section>
    </div>
  );
}
