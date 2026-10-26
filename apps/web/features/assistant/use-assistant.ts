"use client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
export type AssistantAnswer = {
  id: string;
  manifest_id: string;
  question: string;
  created_at: string;
  status: "pending" | "ready" | "waiting_dependency" | "failed";
  answer_fa: string | null;
  evidence_refs: string[];
  dependency_code: string | null;
  related_path: string | null;
  version: number;
};
type AnswerPage = { items: AssistantAnswer[]; next_cursor: string | null };
export type ModelStatus = {
  configured: boolean;
  provider: "openai" | "avalai";
  model_identifier: string | null;
  rates_configured: boolean;
};
const base = (company: string) => `/api/v1/companies/${company}`;
export function useModelStatus(company: string) {
  return useQuery({
    queryKey: ["model-status", company],
    queryFn: ({ signal }) =>
      api.get<ModelStatus>(`${base(company)}/model-status`, signal),
  });
}
export function useAssistantQuestions(company: string) {
  return useInfiniteQuery({
    queryKey: ["assistant-questions", company],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<AnswerPage>(
        `${base(company)}/assistant/questions?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) =>
        p.items.some((a) =>
          ["pending", "waiting_dependency"].includes(a.status),
        ),
      )
        ? 3000
        : false,
  });
}
export function useAssistantCommands(company: string) {
  const cache = useQueryClient();
  const refresh = () =>
    cache.invalidateQueries({ queryKey: ["assistant-questions", company] });
  const ask = useCommand<
    { manifest: string; question: string },
    AssistantAnswer
  >(
    ({ manifest, question }, key) =>
      api.mutate(
        `${base(company)}/assistant/questions`,
        "POST",
        { manifest_id: manifest, question },
        key,
      ),
    refresh,
  );
  const retry = useCommand<AssistantAnswer, AssistantAnswer>(
    (question, key) =>
      api.mutate(
        `${base(company)}/assistant/questions/${question.id}/retry`,
        "POST",
        undefined,
        key,
        question.version,
      ),
    refresh,
  );
  return { ask, retry };
}
