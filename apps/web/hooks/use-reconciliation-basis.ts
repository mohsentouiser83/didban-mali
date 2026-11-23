"use client";
import { useState } from "react";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

type Basis = "native_book" | "imported_ledger";

export function useReconciliationBasis() {
  const workspace = useWorkspace();
  const scope = `${workspace.user?.id}:${workspace.company?.id}`;
  const [selection, setSelection] = useState<{ scope: string; basis: Basis }>();
  const setup = useResource<{ mode: "primary" | "analysis" }>(workspace.companyPath("accounting/setup"));
  const defaultBasis = setup.data?.mode === "primary" ? "native_book" : "imported_ledger";

  return {
    workspace,
    scope,
    basis: selection?.scope === scope ? selection.basis : defaultBasis,
    select(basis: string) {
      if (basis === "native_book" || basis === "imported_ledger") {
        setSelection({ scope, basis });
      }
    },
  };
}
