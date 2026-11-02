"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useResource } from "./use-resource";
export function useScenarioSource() {
  const workspace = useWorkspace();
  const setup = useResource<{ mode: string }>(
    workspace.companyPath("accounting/setup"),
  );
  const scope = `${workspace.user?.id || ""}:${workspace.company?.id || ""}`;
  const [choice, setChoice] = useState({ scope: "", basis: "" });
  const basis =
    choice.scope === scope
      ? choice.basis
      : setup.data?.mode === "primary"
        ? "native_statement"
        : "imported_manifest";
  return {
    workspace,
    setup,
    scope,
    basis,
    select: (basis: string) => setChoice({ scope, basis }),
  };
}
