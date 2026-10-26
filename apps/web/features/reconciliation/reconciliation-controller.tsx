"use client";
import { useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { useCompany, useAccess } from "@/features/companies/use-companies";
import { useResultManifests } from "@/features/results/use-results";
import { formatDate, formatTime } from "@/lib/dates";
import { message } from "@/lib/api";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { FormMessage } from "@/components/ui/field";
import { sourceLabels, unitLabel } from "@/features/results/presentation";
import {
  useReconciliationCommands,
  useReconciliationRuns,
  useCandidates,
} from "./use-reconciliation";
import {
  candidateModel,
  canAccept,
  kindLabels,
  type Kind,
} from "./presentation";
import { ReconciliationView } from "./reconciliation-view";
import { DecisionView } from "./decision-view";
export function ReconciliationController({
  moadian = false,
}: {
  moadian?: boolean;
}) {
  const { companyId } = useParams<{ companyId: string }>();
  const company = useCompany(companyId),
    access = useAccess(companyId),
    manifests = useResultManifests(companyId);
  const [selectedManifest, setManifest] = useState(""),
    [kind, setKind] = useState<Kind>(moadian ? "moadian_sales" : "bank_ledger"),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [action, setAction] = useState<"accept" | "reject" | "needs_review">(
      "needs_review",
    ),
    [reason, setReason] = useState("");
  const all = manifests.data?.pages.flatMap((p) => p.items) ?? [];
  const manifest = selectedManifest || all.at(-1)?.id || "";
  const runs = useReconciliationRuns(companyId, manifest);
  const run = runs.data?.items.find((r) => r.kind === kind);
  const candidates = useCandidates(companyId, run?.id),
    commands = useReconciliationCommands(companyId, manifest);
  if (company.isPending || access.isPending || manifests.isPending)
    return <LoadingState layout="table" />;
  const error =
    company.error ||
    access.error ||
    manifests.error ||
    runs.error ||
    candidates.error;
  if (error)
    return (
      <ErrorState
        message={message(error)}
        onRetry={() => {
          void company.refetch();
          void access.refetch();
          void manifests.refetch();
          void runs.refetch();
          void candidates.refetch();
        }}
      />
    );
  const items = candidates.data?.pages.flatMap((p) => p.items) ?? [];
  const selected = items.find((i) => i.id === selectedId);
  const unit = company.data.display_unit;
  const canOperate = access.data.permissions.includes("company.operate");
  const actions = [
    ...(selected && canAccept(selected)
      ? [{ value: "accept", label: "پذیرش تطبیق" }]
      : []),
    { value: "reject", label: "رد پیشنهاد" },
    { value: "needs_review", label: "برای بررسی" },
  ];
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected || !reason.trim()) return;
    commands.decide.mutate({
      id: selected.id,
      version: selected.version,
      action,
      reason: reason.trim(),
    });
  };
  return (
    <>
      <ReconciliationView
        unit={unitLabel(unit)}
        moreManifests={manifests.hasNextPage}
        manifestBusy={manifests.isFetchingNextPage}
        onMoreManifests={() => {
          void manifests.fetchNextPage();
        }}
        title={moadian ? "تطبیق مؤدیان" : "تطبیق بانک و دفتر"}
        company={company.data.name}
        manifest={manifest}
        manifestOptions={all.map((m) => ({
          value: m.id,
          label: `تا ${formatDate(m.as_of_date)} · تولید ${formatTime(m.published_at)}`,
        }))}
        onManifest={(id) => {
          setManifest(id);
          setSelectedId(null);
        }}
        direction={kind}
        directionOptions={
          moadian
            ? [
                { value: "moadian_sales", label: kindLabels.moadian_sales },
                {
                  value: "moadian_purchases",
                  label: kindLabels.moadian_purchases,
                },
              ]
            : [{ value: "bank_ledger", label: kindLabels.bank_ledger }]
        }
        onDirection={(id) => {
          setKind(id as Kind);
          setSelectedId(null);
        }}
        ready={!!run}
        loading={
          !!manifest && (runs.isPending || (!!run && candidates.isPending))
        }
        missing={
          run?.missing_source_kinds.map(
            (s) => sourceLabels[s] ?? "منبع مالی",
          ) ?? []
        }
        items={items.map((i) => candidateModel(i, unit))}
        onOpen={(id) => {
          commands.decide.reset();
          setSelectedId(id);
          setAction("needs_review");
          setReason("");
        }}
        onStart={() => commands.start.mutate(kind)}
        startBusy={commands.start.isPending}
        canOperate={canOperate}
        more={candidates.hasNextPage}
        onMore={() => {
          void candidates.fetchNextPage();
        }}
        moreBusy={candidates.isFetchingNextPage}
        error={
          commands.start.error ? (
            <FormMessage>{message(commands.start.error)}</FormMessage>
          ) : null
        }
      />
      {selected ? (
        <DecisionView
          item={candidateModel(selected, unit)}
          unit={unitLabel(unit)}
          onClose={() => setSelectedId(null)}
          canOperate={canOperate}
          action={action}
          actions={actions}
          onAction={(value) => {
            setAction(value as typeof action);
            commands.decide.reset();
          }}
          reason={reason}
          onReason={(value) => {
            setReason(value);
            commands.decide.reset();
          }}
          onSubmit={submit}
          busy={commands.decide.isPending}
          error={commands.decide.error ? message(commands.decide.error) : null}
          success={commands.decide.isSuccess}
        />
      ) : null}
    </>
  );
}
