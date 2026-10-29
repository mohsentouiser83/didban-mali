"use client";
import { message } from "@/lib/api";
import { useExtensionEvents } from "./use-extension-events";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableRowHeader,
  TableCell,
} from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/states";
export function ModuleHistory({ company }: { company: string }) {
  const query = useExtensionEvents(company);
  if (query.isPending) return <LoadingState layout="table" />;
  if (query.error)
    return (
      <ErrorState
        message={message(query.error)}
        onRetry={() => query.refetch()}
      />
    );
  const rows = query.rows;
  return (
    <section className="mt-8 space-y-4" aria-label="سابقه تغییرات ماژول و مجوز">
      <h2 className="font-medium">سابقه تغییرات</h2>
      {rows.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>موضوع</TableHead>
              <TableHead>ثبت‌کننده</TableHead>
              <TableHead>تاریخ</TableHead>
              <TableHead>تغییرات</TableHead>
              <TableHead>دلیل</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableRowHeader>{row.subject}</TableRowHeader>
                <TableCell>{row.actor}</TableCell>
                <TableCell>{row.date}</TableCell>
                <TableCell className="max-w-sm whitespace-normal">
                  {row.changes}
                </TableCell>
                <TableCell className="max-w-sm whitespace-normal">
                  {row.reason}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <EmptyState title="تغییری ثبت نشده است" />
      )}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "در حال دریافت…" : "سوابق بیشتر"}
        </Button>
      ) : null}
    </section>
  );
}
