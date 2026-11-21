"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import type { ReportBuilderController } from "@/hooks/use-report-builder";
import { listItems } from "@/lib/api";
import { displayDate, persian } from "@/lib/utils";
import { CheckCircleIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { Panel } from "./page-parts";

export function ReportBuilderSaved({
  controller: c,
}: {
  controller: ReportBuilderController;
}) {
  const [tab, setTab] = useState<"definitions" | "runs">("definitions");

  return (
    <Panel
      title={tab === "definitions" ? "گزارش‌های ذخیره‌شده" : "اجراهای ثابت گزارش"}
      action={
        <Tabs
          size="sm"
          value={tab}
          onChange={setTab}
          items={[
            { id: "definitions", label: "تعریف‌های ذخیره‌شده" },
            { id: "runs", label: "اجراهای ثابت" },
          ]}
        />
      }
    >
      {tab === "definitions" ? (
        c.definitions.loading ? (
          <LoadingState label="دریافت گزارش‌های ذخیره‌شده" />
        ) : c.definitions.error ? (
          <ErrorState
            message={c.definitions.error.message}
            onRetry={c.definitions.refresh}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>گزارش</TableHead>
                  <TableHead>نسخه</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listItems(c.definitions.data).length ? (
                  listItems(c.definitions.data).map((item) => {
                    const isDashboard = Boolean(
                      item.spec &&
                        typeof item.spec === "object" &&
                        (item.spec as unknown as Record<string, unknown>)
                          .is_dashboard,
                    );
                    return (
                      <TableRow key={item.id}>
                        <TableRowHeader>
                          <div className="flex items-center gap-2">
                            <span>{item.name}</span>
                            {isDashboard && (
                              <Badge tone="primary" className="gap-1 py-0.5 text-xs">
                                <CheckCircleIcon size={12} />
                                داشبورد فعال
                              </Badge>
                            )}
                          </div>
                        </TableRowHeader>
                        <TableCell>{persian(item.version)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            {c.workspace.canWrite && !isDashboard && (
                              <Button
                                variant="ghost"
                                disabled={c.command.busy}
                                onClick={() => {
                                  void c.command.run(
                                    c.workspace.companyPath(
                                      `report-studio/definitions/${item.id}/set-dashboard`,
                                    ),
                                    { method: "POST" },
                                    () => c.definitions.refresh(),
                                    "گزارش به‌عنوان داشبورد اصلی شرکت تنظیم شد.",
                                  );
                                }}
                                className="gap-1 text-xs text-primary hover:bg-primary-soft/40"
                                title="تنظیم این گزارش به‌عنوان داشبورد اصلی شرکت"
                              >
                                <SquaresFourIcon size={15} />
                                تعیین به‌عنوان داشبورد
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              disabled={c.command.busy}
                              onClick={() => c.open(item)}
                            >
                              بررسی تعریف
                            </Button>
                            {c.workspace.canWrite && (
                              <Button
                                variant="soft"
                                disabled={c.command.busy}
                                onClick={() => c.rerun(item)}
                              >
                                اجرای دوباره
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableEmptyCell colSpan={3} title="گزارش ذخیره‌شده‌ای نیست" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...c.definitions} />
          </>
        )
      ) : c.runs.loading ? (
        <LoadingState label="دریافت اجراهای گزارش" />
      ) : c.runs.error ? (
        <ErrorState
          message={c.runs.error.message}
          onRetry={c.runs.refresh}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>گزارش</TableHead>
                <TableHead>تاریخ اجرا</TableHead>
                <TableHead>ردیف‌ها</TableHead>
                <TableHead>مشاهده</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listItems(c.runs.data).length ? (
                listItems(c.runs.data).map((item) => (
                  <TableRow key={item.id}>
                    <TableRowHeader>{item.title}</TableRowHeader>
                    <TableCell>{displayDate(item.created_at)}</TableCell>
                    <TableCell>{persian(item.row_count || 0)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        disabled={c.command.busy}
                        onClick={() => c.viewRun(item)}
                      >
                        مشاهدهٔ همین نسخه
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell colSpan={4} title="اجرای ذخیره‌شده‌ای نیست" />
              )}
            </TableBody>
          </Table>
          <CursorPagination {...c.runs} />
        </>
      )}
    </Panel>
  );
}
