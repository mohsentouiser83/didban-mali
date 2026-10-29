"use client";
import { useState, type RefObject } from "react";
import { persianDigits } from "@/lib/dates";
import { importPage, IMPORT_PAGE_SIZE } from "./payroll-import-values";
import { PayrollImportView } from "./payroll-import-view";
import type { ImportPreview } from "./types";
export function ImportDetails({
  preview,
  busy,
  error,
  onClose,
  returnFocusRef,
  onCommit,
}: {
  preview: ImportPreview;
  busy: boolean;
  error?: string;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
  onCommit: () => void;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(
    1,
    Math.ceil(preview.content.preview_rows.length / IMPORT_PAGE_SIZE),
  );
  return (
    <PayrollImportView
      returnFocusRef={returnFocusRef}
      rows={importPage(preview, page)}
      count={persianDigits(String(preview.content.row_count))}
      errors={persianDigits(String(preview.content.errors.length))}
      hasErrors={preview.content.errors.length > 0}
      pageLabel={`صفحه ${persianDigits(String(page + 1))} از ${persianDigits(String(pages))}`}
      previous={page > 0}
      next={page + 1 < pages}
      busy={busy}
      error={error}
      onClose={onClose}
      onCommit={onCommit}
      onPrevious={() => setPage(page - 1)}
      onNext={() => setPage(page + 1)}
    />
  );
}
