"use client";

import { useState } from "react";
import type { Counterparty } from "@/lib/commercial";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

export function useJournalPartyOptions(value: string, change: (value: string) => void, editable: boolean) {
  const workspace = useWorkspace();
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState({ value: "", label: "" });
  const term = query.trim();
  const parties = useResource<{ items: Counterparty[]; total: number }>(
    editable && term
      ? workspace.companyPath(`commercial/counterparties?active_only=true&limit=20&search=${encodeURIComponent(term)}`)
      : null,
  );

  return {
    query,
    onQueryChange: setQuery,
    options: [
      { value: "", label: "بدون طرف‌حساب" },
      ...(parties.data?.items ?? []).map((party) => ({
        value: party.id,
        label: `${party.name} · ${party.code}`,
      })),
    ],
    selectedLabel: selection.value === value ? selection.label : value,
    onValueChange: (value: string, label: string) => {
      setSelection({ value, label });
      setQuery("");
      change(value);
    },
    loading: parties.loading,
    error: parties.error?.message,
    hasMore: (parties.data?.total ?? 0) > (parties.data?.items.length ?? 0),
  };
}
