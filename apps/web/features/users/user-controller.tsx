"use client";
import { useState } from "react";
import type { Schema } from "@didban/api-client";
import { useCurrentUser } from "@/features/auth/use-auth";
import { useUsers, useInviteUser, useResetUser } from "./use-users";
import { UserListView, InviteUserDialog, ResetUserDialog } from "./user-view";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { message } from "@/lib/api";
export function UserController() {
  const me = useCurrentUser(),
    users = useUsers(!!me.data?.is_installation_admin),
    invite = useInviteUser(),
    reset = useResetUser(),
    [open, setOpen] = useState(false),
    [target, setTarget] = useState<Schema<"DirectoryUser"> | null>(null);
  if (me.isPending) return <LoadingState />;
  if (!me.data?.is_installation_admin)
    return <ErrorState message="این بخش فقط برای مدیر سازمان مجاز است." />;
  if (users.isPending) return <LoadingState layout="table" />;
  if (users.error)
    return (
      <ErrorState
        message={message(users.error)}
        onRetry={() => users.refetch()}
      />
    );
  return (
    <>
      <UserListView
        users={users.data.pages.flatMap((p) => p.items)}
        onInvite={() => setOpen(true)}
        onReset={(u) => {
          reset.reset();
          setTarget(u);
        }}
        more={users.hasNextPage}
        busy={users.isFetchingNextPage}
        onMore={() => {
          void users.fetchNextPage();
        }}
      />
      <InviteUserDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) invite.reset();
        }}
        busy={invite.isPending}
        error={invite.error ? message(invite.error) : undefined}
        token={invite.data}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          invite.mutate({
            display_name: String(f.get("display_name")).trim(),
            email: String(f.get("email")).trim(),
          });
        }}
      />
      {target ? (
        <ResetUserDialog
          user={target}
          onClose={() => {
            setTarget(null);
            reset.reset();
          }}
          onReset={() =>
            reset.mutate({ id: target.id, invitation: !target.activated })
          }
          busy={reset.isPending}
          error={reset.error ? message(reset.error) : undefined}
          token={reset.data}
        />
      ) : null}
    </>
  );
}
