"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { CheckCircleIcon, FilePdfIcon, SquaresFourIcon } from "@phosphor-icons/react";
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
                            <span className="font-medium">{item.name}</span>
                            {isDashboard && (
                              <Badge tone="primary" className="gap-1 py-0.5 text-xs font-medium">
                                <CheckCircleIcon size={12} />
                                داشبورد فعال
                              </Badge>
                            )}
                          </div>
                        </TableRowHeader>
                        <TableCell>{persian(item.version)}</TableCell>
                        <TableCell>
                          <TableRowActions label={`عملیات ${item.name}`}>
                            {/* 1. تبدیل به داشبورد */}
                            {c.workspace.canWrite && (["fixed", "live"] as const).map((mode) => (
                              <TableRowAction
                                key={mode}
                                disabled={c.command.busy}
                                onClick={() => {
                                    void c.command.run(c.workspace.companyPath(`report-studio/definitions/${item.id}/set-dashboard?mode=${mode}`), { method: "POST" }, () => c.definitions.refresh(), "داشبورد شرکت تنظیم شد.");
                                }}
                                icon={<SquaresFourIcon size={15} />}
                              >
                                {mode === "fixed" ? "تبدیل به داشبورد" : "تنظیم به‌عنوان داشبورد زنده"}
                              </TableRowAction>
                            ))}

                            {/* 2. خروجی PDF */}
                            <TableRowAction
                              href={`/api/v1${c.workspace.companyPath(`report-studio/definitions/${item.id}/export?format=pdf`)}`}
                              download
                              title="دریافت فایل PDF این گزارش"
                              icon={<FilePdfIcon size={16} className="text-primary" />}
                            >
                              خروجی PDF
                            </TableRowAction>

                            {/* 3. بررسی و اجرای دوباره */}
                            <TableRowAction
                              disabled={c.command.busy}
                              onClick={() => c.open(item)}
                              kind="view"
                            >
                              بررسی تعریف
                            </TableRowAction>
                            {c.workspace.canWrite && (
                              <TableRowAction disabled={c.command.busy} onClick={() => c.rerun(item)}>اجرای دوباره</TableRowAction>
                            )}
                          </TableRowActions>
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
                      <TableRowActions label={`عملیات ${item.title}`}>
                        <TableRowAction
                          disabled={c.command.busy}
                          onClick={() => c.viewRun(item)}
                          kind="view"
                        >
                          مشاهدهٔ همین نسخه
                        </TableRowAction>
                      </TableRowActions>
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
