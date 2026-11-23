"use client";

import { ButtonLink } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/content-states";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader,
} from "@/components/ui/table";
import { useDocumentSpreadsheets } from "@/hooks/use-document-spreadsheets";
import { Panel } from "./page-parts";

export function DocumentSpreadsheetsPanel() {
  const { resource, rows } = useDocumentSpreadsheets();
  return (
    <Panel title="فایل‌های ورودی جداول و کدینگ">
      {resource.loading ? (
        <LoadingState label="در حال دریافت فایل‌های ورودی" />
      ) : resource.error ? (
        <ErrorState message={resource.error.message} onRetry={resource.refresh} />
      ) : rows.length ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>فایل</TableHead>
                <TableHead>مسیر ورود</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>حجم</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableRowHeader><bdi>{row.name}</bdi></TableRowHeader>
                  <TableCell>{row.originLabel}</TableCell>
                  <TableCell>{row.receivedDate}</TableCell>
                  <TableCell>{row.sizeLabel}</TableCell>
                  <TableCell>
                    <ButtonLink href={row.download} download variant="ghost" aria-label={`دریافت ${row.name}`}>
                      دریافت اصل فایل
                    </ButtonLink>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CursorPagination {...resource} />
        </>
      ) : <EmptyState compact title="هنوز فایل ورودی جدول یا کدینگ ثبت نشده است" />}
    </Panel>
  );
}
