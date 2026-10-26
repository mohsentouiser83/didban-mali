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
export function useCompanies() {
  return useInfiniteQuery({
    queryKey: ["companies"],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"CompanyPage">>(
        `/api/v1/companies?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}
export function useCompany(id: string) {
  return useQuery({
    queryKey: ["company", id],
    queryFn: ({ signal }) =>
      api.get<Schema<"Company">>(`/api/v1/companies/${id}`, signal),
  });
}
export function useAccess(id: string) {
  return useQuery({
    queryKey: ["access", id],
    queryFn: ({ signal }) =>
      api.get<Schema<"CompanyAccess">>(
        `/api/v1/companies/${id}/access`,
        signal,
      ),
  });
}
export function useCreateCompany(done: () => void) {
  const cache = useQueryClient();
  return useCommand<Schema<"CompanyCreate">, Schema<"Company">>(
    (body, key) => api.mutate("/api/v1/admin/companies", "POST", body, key),
    async () => {
      await cache.invalidateQueries({ queryKey: ["companies"] });
      notify.success("شرکت ایجاد شد.");
      done();
    },
  );
}
export function useUpdateCompany(id: string, done: () => void) {
  const cache = useQueryClient();
  return useCommand<
    { body: Schema<"CompanyPatch">; version: number },
    Schema<"Company">
  >(
    ({ body, version }, key) =>
      api.mutate(`/api/v1/companies/${id}`, "PATCH", body, key, version),
    async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["company", id] }),
        cache.invalidateQueries({ queryKey: ["companies"] }),
      ]);
      notify.success("تنظیمات شرکت ثبت شد.");
      done();
    },
  );
}
