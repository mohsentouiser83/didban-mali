"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import type { Company } from "@/lib/api";
import { useCommand } from "./use-command";

export function useCompanyManagement() {
  const workspace = useWorkspace();
  const command = useCommand();
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [businessMode, setBusinessMode] = useState<"trading" | "service">("trading");
  const [snapshot, setSnapshot] = useState<Company | null>(null);
  const selected = selectedId
    ? (workspace.companies.find((item) => item.id === selectedId) ?? snapshot)
    : null;

  return {
    workspace,
    command,
    creating,
    selectedId,
    selected,
    name,
    setName,
    businessMode,
    setBusinessMode,
    openCreate: () => {
      setName("");
      setBusinessMode("trading");
      setSelectedId(null);
      setCreating(true);
      command.clearError();
    },
    closeCreate: () => {
      if (!command.busy) setCreating(false);
    },
    openCompany: (id: string) => {
      const company = workspace.companies.find((item) => item.id === id);
      setCreating(false);
      setSnapshot(company || null);
      setName(company?.name || "");
      setBusinessMode(company?.business_mode ?? "trading");
      setSelectedId(id);
      command.clearError();
    },
    closeCompany: () => {
      if (!command.busy) setSelectedId(null);
    },
    save: () => {
      if (!name.trim() || (!creating && !selected)) return;
      void command.run(
        creating ? "/companies" : `/companies/${selected!.id}`,
        {
          method: creating ? "POST" : "PATCH",
          version: selected?.version,
          body: { name: name.trim(), business_mode: businessMode },
        },
        () => {
          setCreating(false);
          setSelectedId(null);
          void workspace.refreshCompanies();
        },
        "شرکت ذخیره شد.",
      );
    },
  };
}
