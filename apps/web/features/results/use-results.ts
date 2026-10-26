"use client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";

type ManifestPage = {
  items: Schema<"ResultManifest">[];
  next_cursor: string | null;
};
const base = (company: string) =>
  `/api/v1/companies/${encodeURIComponent(company)}`;
export function useResultManifests(company: string) {
  return useInfiniteQuery({
    queryKey: ["result-manifests", company],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<ManifestPage>(
        `${base(company)}/results?limit=25${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}
export function useResultManifest(company: string, manifest: string) {
  return useQuery({
    queryKey: ["result-manifest", company, manifest],
    queryFn: ({ signal }) =>
      api.get<Schema<"ResultManifest">>(
        `${base(company)}/results/${encodeURIComponent(manifest)}`,
        signal,
      ),
  });
}
export function useResultMetrics(company: string, manifest: string) {
  return useInfiniteQuery({
    queryKey: ["result-metrics", company, manifest],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      api.get<Schema<"MetricObservationPage">>(
        `${base(company)}/results/${encodeURIComponent(manifest)}/metrics?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        signal,
      ),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}
export function useResultEvidence(company: string, id: string | null) {
  return useQuery({
    queryKey: ["result-evidence", company, id],
    enabled: id !== null,
    queryFn: ({ signal }) =>
      api.get<Schema<"Evidence">>(
        `${base(company)}/evidence/${encodeURIComponent(id!)}`,
        signal,
      ),
  });
}
