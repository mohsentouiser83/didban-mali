"use client";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { useCommand } from "@/lib/use-command";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/sonner";
export function usePeriods(company: string) {
  return useInfiniteQuery({
    queryKey: ["periods", company],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"PeriodPage">>(
        `/api/v1/companies/${company}/financial-periods?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  });
}
export function usePeriodCommands(company: string, done: () => void) {
  const cache = useQueryClient();
  const changed = async () => {
    await cache.invalidateQueries({ queryKey: ["periods", company] });
    done();
  };
  const create = useCommand<Schema<"PeriodCreate">, Schema<"Period">>(
    (body, key) =>
      api.mutate(
        `/api/v1/companies/${company}/financial-periods`,
        "POST",
        body,
        key,
      ),
    async () => {
      notify.success("دوره ایجاد شد.");
      await changed();
    },
  );
  const update = useCommand<
    { id: string; version: number; body: Schema<"PeriodPatch"> },
    Schema<"Period">
  >(
    ({ id, version, body }, key) =>
      api.mutate(
        `/api/v1/companies/${company}/financial-periods/${id}`,
        "PATCH",
        body,
        key,
        version,
      ),
    async () => {
      notify.success("دوره ویرایش شد.");
      await changed();
    },
  );
  const remove = useCommand<Schema<"Period">, Schema<"Success">>(
    (period, key) =>
      api.mutate(
        `/api/v1/companies/${company}/financial-periods/${period.id}`,
        "DELETE",
        undefined,
        key,
        period.version,
      ),
    async () => {
      notify.success("دوره حذف شد.");
      await changed();
    },
  );
  return { create, update, remove };
}
