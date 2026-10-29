"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import type { Schema } from "@didban/api-client";
import { useAccess, useCompany } from "@/features/companies/use-companies";
import { useMembers, useMemberCommands, usePermission } from "./use-members";
import {
  MemberListView,
  AddMemberDialog,
  EditMemberDialog,
  PermissionForm,
  type Member,
} from "./member-view";
import { LoadingState, ErrorState } from "@/components/ui/states";
import { Dialog } from "@/components/ui/dialog";
import { message } from "@/lib/api";
import { PayrollPermissionDialog } from "./payroll-permission-dialog";
export function MemberController() {
  const { companyId } = useParams<{ companyId: string }>(),
    access = useAccess(companyId),
    company = useCompany(companyId);
  const allowed = access.data?.permissions.includes("company.owner") ?? false;
  const members = useMembers(companyId, allowed),
    [mode, setMode] = useState<
      "add" | "edit" | "permission" | "payroll" | null
    >(null),
    [target, setTarget] = useState<Member | null>(null);
  const commands = useMemberCommands(companyId, () => {
    setMode(null);
    setTarget(null);
  });
  const permission = usePermission(
    companyId,
    mode === "permission" ? target?.id : undefined,
  );
  const close = () => {
    setMode(null);
    setTarget(null);
    commands.add.reset();
    commands.edit.reset();
    commands.permission.reset();
  };
  if (access.isPending || company.isPending) return <LoadingState />;
  if (access.error || company.error)
    return (
      <ErrorState
        message={message(access.error || company.error)}
        onRetry={() => {
          void access.refetch();
          void company.refetch();
        }}
      />
    );
  if (!allowed)
    return (
      <ErrorState message="مدیریت اعضا فقط برای مالک این شرکت مجاز است." />
    );
  if (members.isPending) return <LoadingState layout="table" />;
  if (members.error)
    return (
      <ErrorState
        message={message(members.error)}
        onRetry={() => members.refetch()}
      />
    );
  return (
    <>
      <MemberListView
        company={company.data}
        members={members.data.pages.flatMap((p) => p.items)}
        onAdd={() => setMode("add")}
        onEdit={(m) => {
          setTarget(m);
          setMode("edit");
        }}
        onPayrollPermission={(m) => {
          setTarget(m);
          setMode("payroll");
        }}
        onPermission={(m) => {
          setTarget(m);
          setMode("permission");
        }}
        more={members.hasNextPage}
        busy={members.isFetchingNextPage}
        onMore={() => {
          void members.fetchNextPage();
        }}
      />
      {mode === "payroll" && target ? (
        <PayrollPermissionDialog
          company={companyId}
          member={target}
          onClose={close}
        />
      ) : null}
      {mode === "add" ? (
        <AddMemberDialog
          open
          onOpenChange={(v) => {
            if (!v) close();
          }}
          busy={commands.add.isPending}
          error={commands.add.error ? message(commands.add.error) : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            commands.add.mutate({
              email: String(f.get("email")).trim(),
              role: String(f.get("role")) as Schema<"MembershipCreate">["role"],
            });
          }}
        />
      ) : null}
      {mode === "edit" && target ? (
        <EditMemberDialog
          key={target.id + target.version}
          member={target}
          onClose={close}
          busy={commands.edit.isPending}
          error={commands.edit.error ? message(commands.edit.error) : undefined}
          onRefresh={() => {
            void members.refetch();
            close();
          }}
          onSubmit={(body) =>
            commands.edit.mutate({
              id: target.id,
              version: target.version,
              body,
            })
          }
        />
      ) : null}
      {mode === "permission" && target ? (
        <Dialog
          icon="ShieldCheck"
          busy={commands.permission.isPending}
          open
          onOpenChange={(v) => {
            if (!v) close();
          }}
          title="مجوز تأیید گزارش"
          description={target.display_name}
        >
          {permission.data ? (
            <PermissionForm
              key={target.id + permission.data.version}
              permission={permission.data}
              busy={commands.permission.isPending}
              error={
                commands.permission.error
                  ? message(commands.permission.error)
                  : undefined
              }
              onRefresh={() => {
                void permission.refetch();
                commands.permission.reset();
              }}
              onSubmit={(event, enabled) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                commands.permission.mutate({
                  id: target.id,
                  version: permission.data.version,
                  body: { enabled, reason: String(form.get("reason")).trim() },
                });
              }}
            />
          ) : permission.error ? (
            <ErrorState
              message={message(permission.error)}
              onRetry={() => permission.refetch()}
            />
          ) : (
            <LoadingState />
          )}
        </Dialog>
      ) : null}
    </>
  );
}
