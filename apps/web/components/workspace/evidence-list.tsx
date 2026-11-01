"use client";
import { useState } from "react";
import { Pagination } from "@/components/ui/pagination";
import { FileTextIcon, DownloadSimpleIcon } from "@phosphor-icons/react";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import type { SourceEvidence } from "@/lib/api";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import {
  StatusMessage,
  ErrorState,
  Skeleton,
} from "@/components/ui/content-states";
import { persian } from "@/lib/utils";
function EvidenceRow({ id }: { id: string }) {
  const workspace = useWorkspace();
  const resource = useResource<SourceEvidence>(
    workspace.companyPath(`source-rows/${id}`),
  );
  if (resource.loading) return <Skeleton className="h-28" />;
  if (resource.error)
    return <ErrorState message="شاهد دریافت نشد." onRetry={resource.refresh} />;
  const evidence = resource.data;
  if (!evidence) return null;
  return (
    <section className="min-w-0 space-y-3 rounded-control border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileTextIcon
            size={18}
            className="shrink-0 text-primary"
            aria-hidden
          />
          <p className="break-all font-medium">{evidence.filename}</p>
        </div>
        <a
          href={`/api/v1${workspace.companyPath(`source-files/${evidence.file_id}/download`)}`}
          className="grid size-11 shrink-0 place-items-center rounded-control text-primary outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="دریافت اصل سند"
        >
          <DownloadSimpleIcon size={20} />
        </a>
      </div>
      <p className="text-xs text-muted">
        {evidence.sheet} · ردیف {persian(evidence.row_number)}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ستون</TableHead>
            <TableHead>مقدار منبع</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(evidence.values).map(([key, value]) => (
            <TableRow key={key}>
              <TableRowHeader>{key}</TableRowHeader>
              <TableCell className="max-w-64 break-words">
                {value || "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
export function EvidenceList({ evidence }: { evidence: unknown[] }) {
  const [requestedPage, setPage] = useState(0);
  const page = Math.min(
    requestedPage,
    Math.max(0, Math.ceil(evidence.length / 5) - 1),
  );
  if (!evidence.length)
    return <StatusMessage>شاهد قابل نمایش موجود نیست.</StatusMessage>;
  return (
    <div className="space-y-4">
      {evidence.slice(page * 5, (page + 1) * 5).map((item, index) =>
        typeof item === "string" && /^[\da-f]{8}-[\da-f-]{27}$/i.test(item) ? (
          <EvidenceRow key={item} id={item} />
        ) : (
          <div
            key={index}
            className="break-all rounded-control border border-border p-3 text-sm"
          >
            {typeof item === "string"
              ? item
              : item && typeof item === "object"
                ? Object.entries(item)
                    .filter(([, value]) => typeof value !== "object")
                    .map(([key, value]) => (
                      <p key={key}>
                        {key}: {String(value ?? "—")}
                      </p>
                    ))
                : "—"}
          </div>
        ),
      )}
      <Pagination
        page={page}
        total={evidence.length}
        pageSize={5}
        onPrevious={() => setPage(Math.max(0, page - 1))}
        onNext={() => setPage(page + 1)}
      />
    </div>
  );
}
