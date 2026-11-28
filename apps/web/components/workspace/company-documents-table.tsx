"use client";

import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { ArchiveIcon, ArrowUpLeftIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { FormMessage } from "@/components/ui/field";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table, TableBody, TableCell, TableEmptyCell, TableHead, TableHeader, TableRow, TableRowHeader,
} from "@/components/ui/table";
import type { CompanyDocumentsView } from "@/hooks/use-company-documents";
import { Panel } from "./page-parts";

export function CompanyDocumentsTable({ view }: { view: CompanyDocumentsView }) {
  const { resource, rows, intake, extraction } = view;
  return (
    <section id="bot-documents">
      <Panel>
        {resource.loading ? (
          <LoadingState label="در حال دریافت فایل‌ها و مدارک" variant="table" />
        ) : resource.error ? (
          <ErrorState message={resource.error.message} />
        ) : (
          <Table title="فایل‌ها و مدارک" aria-label="فایل‌ها و مدارک">
            <TableHeader>
              <TableRow>
                <TableHead>نام فایل یا مدرک</TableHead>
                <TableHead>مسیر ورود</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead>دورهٔ مالی</TableHead>
                <TableHead>مشخصات فایل</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <DocumentRow key={`${row.document.kind}:${row.document.id}`} row={row} view={view} />
              ))}
              {!rows.length && <TableEmptyCell colSpan={7} title="هنوز فایل یا مدرکی ثبت نشده است" />}
            </TableBody>
          </Table>
        )}
        {!resource.loading && <CursorPagination {...resource} />}
        <FormMessage error>{intake.command.error?.message}</FormMessage>
        <FormMessage error>{extraction.command.error?.message}</FormMessage>
      </Panel>
    </section>
  );
}

function DocumentRow({
  row, view,
}: { row: CompanyDocumentsView["rows"][number]; view: CompanyDocumentsView }) {
  const { document } = row;
  return (
    <TableRow>
      <TableRowHeader>
        <bdi className="block max-w-64 wrap-anywhere">{document.name}</bdi>
        {document.kind === "bot" && document.duplicate_original && (
          <Badge tone="warning" className="mt-1">اصل مدرک تکراری است</Badge>
        )}
      </TableRowHeader>
      <TableCell>{row.origin}</TableCell>
      <TableCell className="whitespace-nowrap">{row.date}</TableCell>
      <TableCell>{document.kind === "source" ? document.period_name || "—" : "—"}</TableCell>
      <TableCell className="whitespace-nowrap">
        {row.size}
        {row.rowCount && <span className="block text-xs text-muted">{row.rowCount}</span>}
      </TableCell>
      <TableCell>
        {document.kind === "source" ? (
          document.archived ? <Badge>بایگانی</Badge> : <StatusBadge status={document.state} />
        ) : row.botState ?? "—"}
      </TableCell>
      <TableCell>
        <TableRowActions label={`عملیات ${document.name}`}>
          <TableRowAction
            download
            href={row.download}
            aria-label={`دریافت ${document.name}`}
            icon={<DownloadSimpleIcon size={20} aria-hidden />}
          >
            دریافت فایل
          </TableRowAction>
          {document.kind === "source" && view.canWrite && !document.archived && (
            <TableRowAction
              aria-label={`بایگانی ${document.name}`}
              onClick={() => view.requestArchive(document)}
              icon={<ArchiveIcon size={20} aria-hidden />}
            >
              بایگانی
            </TableRowAction>
          )}
          {document.kind === "bot" && <BotDocumentActions document={document} view={view} />}
          {row.reportLink && (
            <TableRowAction href={row.reportLink} icon={<ArrowUpLeftIcon size={14} aria-hidden />}>گزارش پردازش</TableRowAction>
          )}
        </TableRowActions>
      </TableCell>
    </TableRow>
  );
}

function BotDocumentActions({
  document, view: { intake, extraction },
}: {
  document: Extract<CompanyDocumentsView["rows"][number]["document"], { kind: "bot" }>;
  view: CompanyDocumentsView;
}) {
  if (!intake.canImport) return null;
  if (document.state === "awaiting_import") {
    return (
      <TableRowAction
        disabled={!intake.period}
        busy={intake.command.busy}
        onClick={() => intake.importFile(document)}
      >
        ورود به پردازش
      </TableRowAction>
    );
  }
  if (document.state === "pending_extraction") {
    return (
      <TableRowAction
        disabled={!extraction.status.data?.enabled}
        busy={extraction.command.busy}
        onClick={() => extraction.extract(document)}
      >
        استخراج و بازبینی
      </TableRowAction>
    );
  }
  if (document.state === "awaiting_review") {
    return (
      <TableRowAction
        busy={extraction.command.busy}
        onClick={() => extraction.open(document)}
      >
        بازبینی اطلاعات
      </TableRowAction>
    );
  }
  return null;
}
