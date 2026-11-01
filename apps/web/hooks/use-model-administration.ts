"use client";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
import { usePagedResource } from "./use-paged-resource";
import { useCommand } from "./use-command";
import {
  listItems,
  type InstallationBudget,
  type InstallationModelConfiguration,
  type ModelStatus,
  type ModelTariff,
  type ModelRequest,
  type ResourceList,
} from "@/lib/api";
export function useModelAdministration() {
  const workspace = useWorkspace();
  const configuration = useResource<InstallationModelConfiguration>(
    workspace.user?.installation_admin ? "/admin/model-configuration" : null,
  );
  const status = useResource<ModelStatus>(
    workspace.companyPath("model-status"),
  );
  const budgets = useResource<ResourceList<InstallationBudget>>(
    workspace.user?.installation_admin ? "/admin/model-budget" : null,
  );
  const tariffs = usePagedResource<ModelTariff>(
    workspace.companyPath("model-tariffs"),
  );
  const requests = usePagedResource<ModelRequest>(
    workspace.companyPath("model-requests"),
  );
  const budgetCommand = useCommand();
  const tariffCommand = useCommand();
  const saveBudget = (
    value: { period: string; cap: string; per_session_cap: string | null },
    onDone: () => void,
  ) =>
    budgetCommand.run(
      "/admin/model-budget",
      {
        body: value,
        version: listItems(budgets.data).find(
          (budget) => budget.period === value.period,
        )?.version,
      },
      () => {
        budgets.refresh();
        status.refresh();
        onDone();
      },
      "سقف نصب ذخیره شد.",
    );
  const saveTariff = (
    value: Omit<ModelTariff, "id" | "currency">,
    onDone: () => void,
  ) =>
    tariffCommand.run(
      workspace.companyPath("model-tariffs"),
      { body: value },
      () => {
        tariffs.refresh();
        status.refresh();
        onDone();
      },
      "تعرفه ثبت شد.",
    );
  return {
    workspace,
    configuration,
    status,
    budgets,
    tariffs,
    requests,
    budgetCommand,
    tariffCommand,
    saveBudget,
    saveTariff,
  };
}
