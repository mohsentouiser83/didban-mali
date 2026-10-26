"use client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import { notify } from "@/components/ui/sonner";
export function useMembers(id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ["members", id],
    enabled,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"MemberDirectoryEntryPage">>(
        `/api/v1/companies/${id}/memberships?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}
export function usePermission(company: string, member?: string) {
  return useQuery({
    queryKey: ["permission", company, member],
    enabled: !!member,
    queryFn: ({ signal }) =>
      api.get<Schema<"Permission">>(
        `/api/v1/companies/${company}/memberships/${member}/report-approval-permission`,
        signal,
      ),
  });
}
export function useMemberCommands(company: string, done: () => void) {
  const cache = useQueryClient();
  const updated = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["members", company] }),
      cache.invalidateQueries({ queryKey: ["access", company] }),
      cache.invalidateQueries({ queryKey: ["permission", company] }),
      cache.invalidateQueries({ queryKey: ["companies"] }),
    ]);
    done();
  };
  const add = useCommand<Schema<"MembershipCreate">, Schema<"Membership">>(
    (body, key) =>
      api.mutate(`/api/v1/companies/${company}/memberships`, "POST", body, key),
    async () => {
      notify.success("عضو اضافه شد.");
      await updated();
    },
  );
  const edit = useCommand<
    { id: string; version: number; body: Schema<"MembershipPatch"> },
    Schema<"Membership">
  >(
    ({ id, version, body }, key) =>
      api.mutate(
        `/api/v1/companies/${company}/memberships/${id}`,
        "PATCH",
        body,
        key,
        version,
      ),
    async () => {
      notify.success("دسترسی عضو ثبت شد.");
      await updated();
    },
  );
  const permission = useCommand<
    { id: string; version: number; body: Schema<"PermissionRequest"> },
    Schema<"Permission">
  >(
    ({ id, version, body }, key) =>
      api.mutate(
        `/api/v1/companies/${company}/memberships/${id}/report-approval-permission`,
        "PUT",
        body,
        key,
        version,
      ),
    async () => {
      notify.success("مجوز تأیید گزارش ثبت شد.");
      await updated();
    },
  );
  return { add, edit, permission };
}
