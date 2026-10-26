"use client";
import { ProcessingQuestion } from "@/features/intake/processing-question";
import { useParams } from "next/navigation";
import { useState } from "react";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { useAccess } from "@/features/companies/use-companies";
import { useSession, useIssues } from "@/features/intake/use-intake";
import { count } from "@/features/intake/presentation";
import { message } from "@/lib/api";
import { useInterpretation, useNormalizedRows } from "./use-interpretation";
import {
  InterpretationView,
  RowEvidence,
  type RowDisplay,
} from "./interpretation-view";
import { MappingController } from "./mapping-controller";
import { formatCanonical } from "./format-values";
import { kinds, fields, errorLabel, controlLabels } from "./labels";
import { canConfigureInterpretation } from "./permissions";
export function InterpretationController() {
  const { companyId, sessionId, fileId } = useParams<{
    companyId: string;
    sessionId: string;
    fileId: string;
  }>();
  const session = useSession(companyId, sessionId),
    access = useAccess(companyId),
    data = useInterpretation(
      companyId,
      sessionId,
      fileId,
      !session.data?.interpretation_finished_at,
    ),
    issues = useIssues(
      companyId,
      sessionId,
      session.data?.status === "waiting_input",
    );
  const rows = useNormalizedRows(
    companyId,
    sessionId,
    fileId,
    data.data?.run_id,
  );
  const [editor, setEditor] = useState(false),
    [dismissed, setDismissed] = useState<string | null>(null),
    [evidence, setEvidence] = useState<RowDisplay | null>(null);
  if (session.isPending || access.isPending || data.isPending)
    return <LoadingState layout="table" />;
  if (session.error || access.error || data.error)
    return (
      <ErrorState
        message={message(session.error || access.error || data.error)}
        onRetry={() => {
          void session.refetch();
          void access.refetch();
          void data.refetch();
        }}
      />
    );
  const summary = data.data.summary,
    required = issues.data?.items.find(
      (i) =>
        i.status === "open" &&
        i.code === "interpretation_mapping" &&
        i.constraints.file_id === fileId,
    );
  const rowDisplay: RowDisplay[] = (
    rows.data?.pages.flatMap((p) => p.items) ?? []
  ).map((row) => ({
    id: row.id,
    location: `${row.sheet_name} · ${count(row.row_number)}`,
    kind: kinds[row.source_kind] ?? row.source_kind,
    state: {
      valid: "کنترل اولیه موفق",
      rejected: "ردشده",
      excluded_overlap: "خارج از مجموعه مالی",
    }[row.state],
    tone: row.state === "valid" ? "success" : "warning",
    errors: row.error_codes.map(errorLabel),
    raw: row.raw_values.map((v, i) => ({
      label: `${count(i + 1)} · ${data.data.previews.find((p) => p.sheet_name === row.sheet_name)?.columns[i] ?? "ستون"}`,
      value: v ?? "خالی",
    })),
    values: row.values.map((v) => ({
      label: fields[v.field] ?? v.field,
      value: formatCanonical(v.field, v.value),
    })),
  }));
  const canConfigure = canConfigureInterpretation(
    session.data,
    access.data.permissions.includes("company.operate"),
    data.data.previews.length,
  );
  return (
    <>
      <InterpretationView
        rowState={
          rows.isLoading ? (
            <LoadingState layout="table" />
          ) : rows.error ? (
            <ErrorState
              message={message(rows.error)}
              onRetry={() => {
                void rows.refetch();
              }}
            />
          ) : undefined
        }
        question={
          <ProcessingQuestion
            companyId={companyId}
            session={session.data}
            canOperate={access.data.permissions.includes("company.operate")}
            showTrigger
            skipMapping
          />
        }
        name={data.data.original_name}
        back={`/companies/${companyId}/uploads/${sessionId}`}
        summary={
          summary
            ? `${count(summary.valid_rows)} معتبر · ${count(summary.rejected_rows)} ردشده · ${count(summary.excluded_rows)} کنارگذاشته به علت هم‌پوشانی`
            : undefined
        }
        sheets={(summary?.sheets ?? []).map((s) => ({
          name: s.sheet_name,
          kind: kinds[s.source_kind] ?? s.source_kind,
          provenance:
            s.provenance === "human" ? "تنظیم کاربر" : "نگاشت خودکار کنترل‌شده",
          controls: s.controls.map((c) => ({
            label: controlLabels[c.key] ?? c.key,
            value: {
              passed: "بررسی شد",
              failed: "رد شد",
              unknown: "تأیید نشده",
            }[c.outcome],
          })),
        }))}
        rows={rowDisplay}
        onEvidence={setEvidence}
        onConfigure={() => {
          if (canConfigure) setEditor(true);
        }}
        canConfigure={canConfigure}
        configurationLocked={
          !!session.data.manifest_id &&
          access.data.permissions.includes("company.operate")
        }
        published={!!session.data.manifest_id}
        more={rows.hasNextPage}
        onMore={() => {
          void rows.fetchNextPage();
        }}
        busy={rows.isFetchingNextPage}
        waiting={!session.data.interpretation_finished_at}
      />
      {canConfigure ? (
        <MappingController
          key={required?.id ?? String(editor)}
          company={companyId}
          session={sessionId}
          file={fileId}
          data={data.data}
          version={session.data.session_version}
          open={editor || (!!required && dismissed !== required.id)}
          onOpenChange={(open) => {
            setEditor(open);
            if (!open && required) setDismissed(required.id);
          }}
        />
      ) : null}
      <RowEvidence row={evidence} onClose={() => setEvidence(null)} />
    </>
  );
}
