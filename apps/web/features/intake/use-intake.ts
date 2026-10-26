"use client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
export const pathFor = (company: string) => `/api/v1/companies/${company}`;
export const sessionPollingDone = (s?: Schema<"ProcessingSession">) => {
  if (!s) return false;
  if (
    ["failed", "cancelled", "completed", "completed_limited"].includes(s.status)
  )
    return true;
  if (s.status === "waiting_input") return false;
  if (s.report_id) return false;
  if (
    s.steps.some(
      (step) =>
        (step.kind.startsWith("analysis:") ||
          step.kind.startsWith("forecast:")) &&
        !["succeeded", "limited", "cancelled", "failed"].includes(step.status),
    )
  )
    return false;
  return (
    !!s.analysis_finished_at ||
    !!s.financial_finished_at ||
    (!!s.interpretation_finished_at &&
      !s.steps.some((step) => step.kind.startsWith("financial:")))
  );
};
export function useSessions(company: string) {
  return useInfiniteQuery({
    queryKey: ["sessions", company],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"ProcessingSessionPage">>(
        `${pathFor(company)}/processing-sessions?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) =>
        p.items.some((s) => !sessionPollingDone(s)),
      )
        ? 4000
        : false,
  });
}
export function useSession(company: string, session: string) {
  return useQuery({
    queryKey: ["session", company, session],
    queryFn: ({ signal }) =>
      api.get<Schema<"ProcessingSession">>(
        `${pathFor(company)}/processing-sessions/${session}`,
        signal,
      ),
    refetchInterval: (q) => (sessionPollingDone(q.state.data) ? false : 2000),
  });
}
export function useFiles(company: string, session: string, finished: boolean) {
  return useQuery({
    queryKey: ["files", company, session],
    queryFn: ({ signal }) =>
      api.get<Schema<"FilePage">>(
        `${pathFor(company)}/processing-sessions/${session}/files?limit=100`,
        signal,
      ),
    refetchInterval: finished ? false : 2000,
  });
}
export function useIssues(company: string, session: string, enabled: boolean) {
  return useQuery({
    queryKey: ["issues", company, session],
    enabled,
    queryFn: ({ signal }) =>
      api.get<Schema<"ProcessingIssuePage">>(
        `${pathFor(company)}/processing-sessions/${session}/issues?status=open&limit=100`,
        signal,
      ),
    refetchInterval: enabled ? 2000 : false,
  });
}
export function useSessionCommands(company: string, session: string) {
  const cache = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["session", company, session] }),
      cache.invalidateQueries({ queryKey: ["issues", company, session] }),
      cache.invalidateQueries({ queryKey: ["files", company, session] }),
      cache.invalidateQueries({ queryKey: ["sessions", company] }),
    ]);
  };
  const cancel = useCommand<number, Schema<"AcceptedOperation">>(
    (version, key) =>
      api.mutate(
        `${pathFor(company)}/processing-sessions/${session}/cancel`,
        "POST",
        undefined,
        key,
        version,
      ),
    refresh,
  );
  const seal = useCommand<
    { version: number; files: string[] },
    Schema<"AcceptedOperation">
  >(
    ({ version, files }, key) =>
      api.mutate(
        `${pathFor(company)}/processing-sessions/${session}/seal`,
        "POST",
        { expected_file_ids: files },
        key,
        version,
      ),
    refresh,
  );
  const retry = useCommand<
    { version: number; steps: string[] },
    Schema<"AcceptedOperation">
  >(
    ({ version, steps }, key) =>
      api.mutate(
        `${pathFor(company)}/processing-sessions/${session}/retry`,
        "POST",
        { step_ids: steps },
        key,
        version,
      ),
    refresh,
  );
  const interpret = useCommand<number, Schema<"AcceptedOperation">>(
    (version, key) =>
      api.mutate(
        `${pathFor(company)}/processing-sessions/${session}/interpret`,
        "POST",
        undefined,
        key,
        version,
      ),
    refresh,
  );
  const calculate = useCommand<number, Schema<"AcceptedOperation">>(
    (version, key) =>
      api.mutate(
        `${pathFor(company)}/processing-sessions/${session}/calculate`,
        "POST",
        undefined,
        key,
        version,
      ),
    refresh,
  );
  const analyze = useCommand<number, Schema<"AcceptedOperation">>(
    (version, key) =>
      api.mutate(
        `${pathFor(company)}/processing-sessions/${session}/analyze`,
        "POST",
        undefined,
        key,
        version,
      ),
    refresh,
  );
  const answer = useCommand<
    { issue: string; version: number; value: string },
    Schema<"AnswerReceipt">
  >(
    ({ issue, version, value }, key) =>
      api.mutate(
        `${pathFor(company)}/processing-issues/${issue}/answers`,
        "POST",
        { answer: { kind: "choice", value } },
        key,
        version,
      ),
    refresh,
  );
  return {
    cancel,
    seal,
    retry,
    answer,
    interpret,
    calculate,
    analyze,
    refresh,
  };
}
