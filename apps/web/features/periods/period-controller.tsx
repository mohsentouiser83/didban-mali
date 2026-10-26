"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import type { Schema } from "@didban/api-client";
import { useAccess, useCompany } from "@/features/companies/use-companies";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
import { message } from "@/lib/api";
import { usePeriods, usePeriodCommands } from "./use-periods";
import { PeriodListView, PeriodFormDialog } from "./period-view";
export function PeriodController() {
  const { companyId } = useParams<{ companyId: string }>(),
    access = useAccess(companyId),
    company = useCompany(companyId),
    periods = usePeriods(companyId);
  const [mode, setMode] = useState<"create" | "edit" | "delete" | null>(null),
    [target, setTarget] = useState<Schema<"Period"> | null>(null);
  const commands = usePeriodCommands(companyId, () => {
    setMode(null);
    setTarget(null);
  });
  const close = () => {
    setMode(null);
    setTarget(null);
    commands.create.reset();
    commands.update.reset();
    commands.remove.reset();
  };
  if (access.isPending || company.isPending || periods.isPending)
    return <LoadingState layout="table" />;
  if (access.error || company.error || periods.error)
    return (
      <ErrorState
        message={message(access.error || company.error || periods.error)}
        onRetry={() => {
          void access.refetch();
          void company.refetch();
          void periods.refetch();
        }}
      />
    );
  const rows = periods.data.pages.flatMap((p) => p.items),
    canManage = access.data.permissions.includes("company.financial_policy"),
    action = mode === "edit" ? commands.update : commands.create;
  return (
    <>
      <PeriodListView
        periods={rows}
        company={company.data.name}
        canManage={canManage}
        onCreate={() => setMode("create")}
        onEdit={(p) => {
          setTarget(p);
          setMode("edit");
        }}
        onDelete={(p) => {
          setTarget(p);
          setMode("delete");
        }}
        more={periods.hasNextPage}
        busy={periods.isFetchingNextPage}
        onMore={() => {
          void periods.fetchNextPage();
        }}
      />
      {mode === "create" || mode === "edit" ? (
        <PeriodFormDialog
          period={target}
          periods={rows}
          onClose={close}
          busy={action.isPending}
          error={action.error ? message(action.error) : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const body = {
              name: String(data.get("name")).trim(),
              starts_on: String(data.get("starts_on")),
              ends_on: String(data.get("ends_on")),
              previous_period_id:
                data.get("previous_period_id") === "none"
                  ? null
                  : String(data.get("previous_period_id")),
            };
            if (target)
              commands.update.mutate({
                id: target.id,
                version: target.version,
                body,
              });
            else commands.create.mutate(body);
          }}
        />
      ) : null}
      {mode === "delete" && target ? (
        <ConfirmDialog
          open
          onOpenChange={(v) => {
            if (!v) close();
          }}
          title="دوره مالی حذف شود؟"
          description={target.name}
          busy={commands.remove.isPending}
          onConfirm={() => commands.remove.mutate(target)}
        >
          <FormMessage>
            {commands.remove.error ? message(commands.remove.error) : undefined}
          </FormMessage>
        </ConfirmDialog>
      ) : null}
    </>
  );
}
