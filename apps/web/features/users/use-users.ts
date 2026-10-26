"use client";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
export function useUsers(enabled = true) {
  return useInfiniteQuery({
    queryKey: ["users"],
    enabled,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"DirectoryUserPage">>(
        `/api/v1/admin/users?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}
export function useInviteUser() {
  const cache = useQueryClient();
  return useCommand<Schema<"CreateUser">, Schema<"ManualToken">>(
    (body, key) => api.mutate("/api/v1/admin/users", "POST", body, key),
    async () => {
      await cache.invalidateQueries({ queryKey: ["users"] });
    },
  );
}
export function useResetUser() {
  return useCommand<{ id: string; invitation: boolean }, Schema<"ManualToken">>(
    ({ id, invitation }, key) =>
      api.mutate(
        `/api/v1/admin/users/${id}/${invitation ? "invitation" : "password-reset"}`,
        "POST",
        undefined,
        key,
      ),
  );
}
