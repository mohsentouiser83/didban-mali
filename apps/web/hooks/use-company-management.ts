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
  const [snapshot, setSnapshot] = useState<Company | null>(null);
  const selected = workspace.company?.id === selectedId ? snapshot : null;
  return {
    workspace,
    command,
    creating,
    selectedId,
    selected,
    name,
    setName,
    openCreate: () => {
      setName("");
      setCreating(true);
      command.clearError();
    },
    closeCreate: () => {
      if (!command.busy) setCreating(false);
    },
    openCompany: (id: string) => {
      const company = workspace.companies.find((item) => item.id === id);
      setSnapshot(company || null);
      setName(company?.name || "");
      setSelectedId(id);
      command.clearError();
      workspace.setCompany(id);
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
          body: { name: name.trim() },
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
