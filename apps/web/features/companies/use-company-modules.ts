"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Schema } from "@didban/api-client";
import { api } from "@/lib/api";
import { useCommand } from "@/lib/use-command";
import { notify } from "@/components/ui/sonner";

export function useCompanyModules(company: string, enabled = true) {
  return useQuery({
    queryKey: ["company-modules", company],
    enabled: enabled && !!company,
    queryFn: ({ signal }) =>
      api.get<Schema<"CompanyModules">>(
        `/api/v1/companies/${company}/modules`,
        signal,
      ),
  });
}
export function useSaveCompanyModules(company: string) {
  const cache = useQueryClient();
  return useCommand<
    { body: Schema<"CompanyModulesRequest">; version: number },
    Schema<"CompanyModules">
  >(
    ({ body, version }, key) =>
      api.mutate(
        `/api/v1/companies/${company}/modules`,
        "PUT",
        body,
        key,
        version,
      ),
    async () => {
      await cache.invalidateQueries({ queryKey: ["company-modules", company] });
      await cache.invalidateQueries({
        queryKey: ["extension-events", company],
      });
      notify.success("ماژول‌های شرکت ثبت شدند.");
    },
  );
}
export function usePayrollAccess(company: string, enabled = true) {
  return useQuery({
    queryKey: ["payroll-access", company],
    enabled: enabled && !!company,
    queryFn: ({ signal }) =>
      api.get<Schema<"PayrollAccess">>(
        `/api/v1/companies/${company}/payroll-access`,
        signal,
      ),
  });
}
