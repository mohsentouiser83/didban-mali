"use client";
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
export const filePath = (company: string, session: string, file: string) =>
  `/api/v1/companies/${company}/processing-sessions/${session}/files/${file}`;
export function useInterpretation(
  company: string,
  session: string,
  file: string,
  active: boolean,
) {
  return useQuery({
    queryKey: ["interpretation", company, session, file],
    queryFn: ({ signal }) =>
      api.get<Schema<"SessionInterpretation">>(
        `${filePath(company, session, file)}/interpretation`,
        signal,
      ),
    refetchInterval: active ? 2000 : false,
  });
}
export function useNormalizedRows(
  company: string,
  session: string,
  file: string,
  run: string | null | undefined,
) {
  return useInfiniteQuery({
    queryKey: ["normalized", company, session, file, run],
    enabled: !!run,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"NormalizedRowPage">>(
        `${filePath(company, session, file)}/rows?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  });
}
export function useConfigure(
  company: string,
  session: string,
  file: string,
  done: () => void,
) {
  const cache = useQueryClient();
  return useCommand<
    { body: Schema<"SessionInterpretationSettings">; version: number },
    Schema<"AcceptedOperation">
  >(
    ({ body, version }, key) =>
      api.mutate(
        `${filePath(company, session, file)}/interpretation`,
        "PUT",
        body,
        key,
        version,
      ),
    async () => {
      await Promise.all([
        cache.invalidateQueries({
          queryKey: ["interpretation", company, session, file],
        }),
        cache.invalidateQueries({ queryKey: ["session", company, session] }),
        cache.invalidateQueries({ queryKey: ["files", company, session] }),
        cache.invalidateQueries({ queryKey: ["issues", company, session] }),
      ]);
      done();
    },
  );
}
