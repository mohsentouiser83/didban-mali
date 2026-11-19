"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { type Period } from "@/lib/api";

export function isPeriodClosed(period: { end?: string }): boolean {
  if (!period.end) return false;
  const today = new Date().toISOString().slice(0, 10);
  return period.end < today;
}

export function usePeriodManagement() {
  const workspace = useWorkspace();
  const resource = usePagedResource<Period>(
    workspace.companyPath("financial-periods"),
  );
  const command = useCommand();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Period | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  function openCreate() {
    setName("");
    setStart("");
    setEnd("");
    setCreating(true);
    command.clearError();
  }

  function closeCreate() {
    setCreating(false);
    command.clearError();
  }

  function save() {
    if (!name.trim() || !start || !end) return;
    void command.run(
      workspace.companyPath("financial-periods"),
      {
        method: "POST",
        body: {
          name: name.trim(),
          start,
          end,
          previous_period_id: null,
        },
      },
      () => {
        closeCreate();
        resource.refresh();
        workspace.refreshPeriods();
      },
      "دوره مالی جدید ایجاد شد.",
    );
  }

  function remove() {
    if (!deleting || deleting.in_use) return;
    void command.run(
      workspace.companyPath(`financial-periods/${deleting.id}`),
      { method: "DELETE", version: deleting.version },
      () => {
        setDeleting(null);
        resource.refresh();
        workspace.refreshPeriods();
      },
      "دوره حذف شد.",
    );
  }

  return {
    workspace,
    resource,
    command,
    creating,
    deleting,
    name,
    start,
    end,
    setCreating,
    setDeleting,
    setName,
    setStart,
    setEnd,
    openCreate,
    closeCreate,
    save,
    remove,
  };
}
