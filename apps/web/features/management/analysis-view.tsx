"use client";
import { AppIcon } from "@/components/ui/app-icon";
import { financialMetricIcon } from "@/components/ui/financial/metric-icons";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard, StatCards } from "@/components/ui/financial/stat-cards";
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

export function AnalysisView({
  model,
  onDriver,
  onCash,
  onCashDriver,
}: {
  model: ManagementModel;
  onDriver: (key: string) => void;
  onCash: () => void;
  onCashDriver: (key: string) => void;
}) {
  const [profitPage, setProfitPage] = useState(0),
    [cashPage, setCashPage] = useState(0);
  return (
    <div className="space-y-7">
      <div className="max-w-xl">
        <StatCard
          icon="TrendingUp"
          title="تغییر سود خالص"
          value={model.analysis.delta}
          unit={model.unit}
        >
          {model.analysis.comparison ? (
            <p className="text-sm text-muted">
              دوره مقایسه: {model.analysis.comparison}
            </p>
          ) : null}
        </StatCard>
      </div>
      {model.analysis.reason ? (
        <StatusMessage>{model.analysis.reason}</StatusMessage>
      ) : null}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-heading text-lg font-medium">
          <AppIcon name="TrendingUp" className="text-primary" />
          سهم حساب‌ها در تغییر سود
        </h2>
        {model.analysis.drivers.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>حساب</TableHead>
                <TableHead>جاری · {model.unit}</TableHead>
                <TableHead>دوره مقایسه</TableHead>
                <TableHead>اثر بر سود</TableHead>
                <TableHead>شواهد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.analysis.drivers
                .slice(profitPage * 20, (profitPage + 1) * 20)
                .map((d) => (
                  <TableRow key={d.key}>
                    <TableRowHeader>
                      {d.account}
                      <span className="mt-1 block text-xs text-muted">
                        {d.label}
                      </span>
                    </TableRowHeader>
                    <TableCell>{d.current}</TableCell>
                    <TableCell>{d.previous}</TableCell>
                    <TableCell>
                      <bdi>{d.effect}</bdi>
                      <span className="mt-2 block">
                        <Badge
                          tone={
                            d.direction === "افزایش سود" ? "success" : "warning"
                          }
                        >
                          {d.direction}
                        </Badge>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" onClick={() => onDriver(d.key)}>
                        <AppIcon name="FileSearch" />
                        اسناد دو دوره
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon="TrendingUp"
            title={
              model.analysis.reason
                ? "تحلیل تغییر سود به داده بیشتری نیاز دارد"
                : "تغییری در اجزای سود ثبت نشده"
            }
          />
        )}
        {model.analysis.drivers.length > 20 ? (
          <div className="flex gap-3">
            <Button
              variant="secondary"
              disabled={profitPage === 0}
              onClick={() => setProfitPage((p) => p - 1)}
            >
              <AppIcon name="ChevronRight" />
              ردیف‌های قبلی
            </Button>
            <Button
              variant="secondary"
              disabled={(profitPage + 1) * 20 >= model.analysis.drivers.length}
              onClick={() => setProfitPage((p) => p + 1)}
            >
              <AppIcon name="ChevronLeft" />
              ردیف‌های بعدی
            </Button>
          </div>
        ) : null}
      </section>
      {model.analysis.cashBridge ? (
        <section className="space-y-5">
          <h2 className="flex items-center gap-2 font-heading text-lg font-medium">
            <AppIcon name="CalendarRange" className="text-primary" />
            تحلیل تغییر نقدینگی در همین بازه
          </h2>
          <StatCards>
            {model.analysis.cashBridge.metrics.map((m) => (
              <StatCard
                icon={financialMetricIcon(m.key)}
                key={m.key}
                title={m.title}
                value={m.value}
                unit={model.unit}
              >
                {m.reason ? (
                  <p className="text-sm leading-7 text-muted">{m.reason}</p>
                ) : null}
              </StatCard>
            ))}
          </StatCards>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <AppIcon name="Banknote" className="text-primary" />
            سهم منابع بانکی در خالص گردش
          </h3>
          {model.analysis.cashBridge.drivers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>منبع بانکی</TableHead>
                  <TableHead>اثر خالص · {model.unit}</TableHead>
                  <TableHead>شواهد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {model.analysis.cashBridge.drivers
                  .slice(cashPage * 20, (cashPage + 1) * 20)
                  .map((d) => (
                    <TableRow key={d.key}>
                      <TableRowHeader>
                        {d.label}
                        <span className="mt-1 block text-xs text-muted">
                          {d.sheet}
                        </span>
                      </TableRowHeader>
                      <TableCell>
                        {d.value}
                        {d.reason ? (
                          <p className="mt-2 text-sm text-muted">{d.reason}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          onClick={() => onCashDriver(d.key)}
                        >
                          تراکنش‌ها
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon="CalendarRange"
              title="گردش بانکی در این بازه ثبت نشده"
            />
          )}
          {model.analysis.cashBridge.drivers.length > 20 ? (
            <div className="flex gap-3">
              <Button
                variant="secondary"
                disabled={cashPage === 0}
                onClick={() => setCashPage((p) => p - 1)}
              >
                <AppIcon name="ChevronRight" />
                ردیف‌های قبلی
              </Button>
              <Button
                variant="secondary"
                disabled={
                  (cashPage + 1) * 20 >=
                  model.analysis.cashBridge.drivers.length
                }
                onClick={() => setCashPage((p) => p + 1)}
              >
                <AppIcon name="ChevronLeft" />
                ردیف‌های بعدی
              </Button>
            </div>
          ) : null}
        </section>
      ) : (
        <StatusMessage>
          این نسخه تحلیل تغییر نقدینگی ندارد؛ نسخه تازه تهیه کنید.
        </StatusMessage>
      )}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <AppIcon name="CalendarRange" className="text-primary" />
          گردش نقد در بازه گزارش
        </h2>
        <Button variant="secondary" onClick={onCash}>
          بررسی تراکنش‌ها
        </Button>
      </section>
    </div>
  );
}
