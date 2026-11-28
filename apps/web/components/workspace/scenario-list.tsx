"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
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
import type { usePagedResource } from "@/hooks/use-paged-resource";
import { displayDate, persian } from "@/lib/utils";
import { Panel } from "./page-parts";

export function ScenarioList<
  T extends {
    id: string;
    name: string;
    version: number;
    created_at?: string;
    baseline?: { as_of_date: string; manifest_id?: string; forecast_run_id?: string };
  },
>({
  title,
  list,
  busy,
  onAdd,
  onOpen,
}: {
  title: string;
  list: ReturnType<typeof usePagedResource<T>>;
  busy: boolean;
  onAdd?: () => void;
  onOpen: (item: T) => void;
}) {
  const rows = list.data?.items ?? [];
  return (
    <Panel
      title={title}
      action={
        onAdd && (
          <Button onClick={onAdd} disabled={busy}>
            سناریوی جدید
          </Button>
        )
      }
    >
      {list.loading ? (
        <LoadingState label="در حال دریافت سناریوها" />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={list.refresh} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>سناریو</TableHead>
                <TableHead>مبنا</TableHead>
                <TableHead>نسخه</TableHead>
                <TableHead>زمان ثبت نسخه</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableRowHeader>{item.name}</TableRowHeader>
                    <TableCell>
                      {item.baseline ? `${item.baseline.forecast_run_id || item.baseline.manifest_id ? "پیش‌بینی" : "گزارش ثابت"} · ${displayDate(item.baseline.as_of_date)}` : "—"}
                    </TableCell>
                    <TableCell>{persian(item.version)}</TableCell>
                    <TableCell>{item.created_at ? displayDate(item.created_at) : "—"}</TableCell>
                    <TableCell>
                      <TableRowActions label={`عملیات ${item.name}`}>
                        <TableRowAction disabled={busy} onClick={() => onOpen(item)} kind="view">مشاهده</TableRowAction>
                      </TableRowActions>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell colSpan={5} title="سناریویی ذخیره نشده" />
              )}
            </TableBody>
          </Table>
          <CursorPagination {...list} />
        </>
      )}
    </Panel>
  );
}
