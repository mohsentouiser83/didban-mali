"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
export const companyPath = (company: string) => `/api/v1/companies/${company}`;
export function useWorkspaceManifests(company: string) {
  return useQuery({
    queryKey: ["workspace-manifests", company],
    queryFn: async ({ signal }) => {
      let cursor: string | null = null;
      const all: Schema<"ResultManifest">[] = [];
      do {
        const page: Schema<"ResultManifestPage"> = await api.get<
          Schema<"ResultManifestPage">
        >(
          `${companyPath(company)}/results?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          signal,
        );
        all.push(...page.items);
        cursor = page.next_cursor;
      } while (cursor);
      return all;
    },
  });
}
export function useSettlementWorkspace(
  company: string,
  manifest: string | undefined,
) {
  return useQuery({
    queryKey: ["settlement-workspace", company, manifest],
    enabled: !!manifest,
    queryFn: ({ signal }) =>
      api.get<Schema<"SettlementWorkspace">>(
        `${companyPath(company)}/settlements/${manifest}`,
        signal,
      ),
  });
}
export function usePlannedPayments(company: string) {
  return useQuery({
    queryKey: ["planned-payments", company],
    queryFn: async ({ signal }) => {
      let cursor: string | null = null;
      const all: Schema<"PlannedPayment">[] = [];
      do {
        const page: Schema<"PlannedPaymentPage"> = await api.get<
          Schema<"PlannedPaymentPage">
        >(
          `${companyPath(company)}/planned-payments?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          signal,
        );
        all.push(...page.items);
        cursor = page.next_cursor;
      } while (cursor);
      return all;
    },
  });
}
export function useRecurrences(company: string) {
  return useQuery({
    queryKey: ["recurrences", company],
    queryFn: ({ signal }) =>
      api.get<Schema<"RecurrenceProposalPage">>(
        `${companyPath(company)}/recurrence-proposals?limit=100`,
        signal,
      ),
  });
}
export function useSettlementCommands(company: string, done: () => void) {
  const cache = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["settlement-workspace", company] }),
      cache.invalidateQueries({ queryKey: ["planned-payments", company] }),
      cache.invalidateQueries({ queryKey: ["recurrences", company] }),
    ]);
    done();
  };
  const allocate = useCommand<
    Schema<"AllocationRequest">,
    Schema<"Allocation">
  >(
    (body, key) =>
      api.mutate(`${companyPath(company)}/allocations`, "POST", body, key),
    refresh,
  );
  const reverse = useCommand<
    { allocation: Schema<"Allocation">; reason: string },
    Schema<"Reversal">
  >(
    ({ allocation, reason }, key) =>
      api.mutate(
        `${companyPath(company)}/allocations/${allocation.id}/reversals`,
        "POST",
        { reason },
        key,
        allocation.version,
      ),
    refresh,
  );
  const event = useCommand<
    { manifest: string; movement: string },
    Schema<"SettlementEvent">
  >(
    ({ manifest, movement }, key) =>
      api.mutate(
        `${companyPath(company)}/results/${manifest}/settlement-events`,
        "POST",
        {
          bank_movement_id: movement,
          reason: "آماده‌سازی گردش بانکی برای تخصیص",
        },
        key,
      ),
    refresh,
  );
  const createPlan = useCommand<
    Schema<"PlannedPaymentCreate">,
    Schema<"PlannedPayment">
  >(
    (body, key) =>
      api.mutate(`${companyPath(company)}/planned-payments`, "POST", body, key),
    refresh,
  );
  const revisePlan = useCommand<
    { plan: Schema<"PlannedPayment">; body: Schema<"PlannedPaymentPatch"> },
    Schema<"PlannedPayment">
  >(
    ({ plan, body }, key) =>
      api.mutate(
        `${companyPath(company)}/planned-payments/${plan.id}`,
        "PATCH",
        body,
        key,
        plan.version,
      ),
    refresh,
  );
  const cancelPlan = useCommand<
    Schema<"PlannedPayment">,
    Schema<"PlannedPayment">
  >(
    (plan, key) =>
      api.mutate(
        `${companyPath(company)}/planned-payments/${plan.id}`,
        "DELETE",
        undefined,
        key,
        plan.version,
      ),
    refresh,
  );
  const recurrence = useCommand<
    { proposal: Schema<"RecurrenceProposal">; action: "accept" | "reject" },
    Schema<"RecurrenceProposal">
  >(
    ({ proposal, action }, key) =>
      api.mutate(
        `${companyPath(company)}/recurrence-proposals/${proposal.id}/decisions`,
        "POST",
        {
          action,
          reason:
            action === "accept"
              ? "تأیید تعهد مستقل پس از بررسی برنامه‌ها"
              : "رد پیشنهاد پس از بررسی",
        },
        key,
        proposal.version,
      ),
    refresh,
  );
  return {
    allocate,
    reverse,
    event,
    createPlan,
    revisePlan,
    cancelPlan,
    recurrence,
  };
}
