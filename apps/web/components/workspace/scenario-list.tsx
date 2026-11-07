"use client";
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
import { persian } from "@/lib/utils";
import { Panel } from "./page-parts";

export function ScenarioList<
  T extends { id: string; name: string; version: number },
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
                <TableHead>نسخه</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableRowHeader>{item.name}</TableRowHeader>
                    <TableCell>{persian(item.version)}</TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => onOpen(item)}
                      >
                        مشاهده
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell colSpan={3} title="سناریویی ذخیره نشده" />
              )}
            </TableBody>
          </Table>
          <CursorPagination {...list} />
        </>
      )}
    </Panel>
  );
}
