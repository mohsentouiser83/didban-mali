"use client";
import { useState } from "react";
import type { OperationTemplate } from "./use-operation-drafts";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

export function useJournalEntryType(open: boolean) {
  const workspace = useWorkspace();
  const [kind, choose] = useState("manual");
  const catalogue = useResource<{ items: OperationTemplate[] }>(
    open ? workspace.companyPath("accounting/operations/catalogue") : null,
  );
  return {
    kind,
    choose,
    catalogue,
    options: [
      { value: "manual", label: "ثبت دستی" },
      ...(catalogue.data?.items || []).map(({ kind, label }) => ({ value: kind, label })),
    ],
  };
}
