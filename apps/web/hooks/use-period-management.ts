"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { moduleAllows } from "@/lib/module-access";
import type { Period } from "@/lib/api";

export type PeriodDateRangeStatus = "upcoming" | "current" | "expired";

export function periodDateRangeStatus(period: { start?: string; end?: string }): PeriodDateRangeStatus {
  const today = new Date().toISOString().slice(0, 10);
  if (period.start && period.start > today) return "upcoming";
  if (period.end && period.end < today) return "expired";
  return "current";
}

export function isPeriodClosed(period: { closed?: boolean }): boolean {
  return Boolean(period.closed);
}

export function usePeriodManagement() {
  const workspace = useWorkspace();
  const resource = usePagedResource<Period>(
    workspace.companyPath("financial-periods"),
  );
  const command = useCommand();
  const canCreate = moduleAllows(workspace.company, "periods", "create", workspace.canWrite);
  const canEdit = moduleAllows(workspace.company, "periods", "edit", workspace.canWrite);
  const canDelete = moduleAllows(workspace.company, "periods", "delete", workspace.canWrite);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Period | null>(null);
  const [deleting, setDeleting] = useState<Period | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  function openCreate() {
    setEditing(null);
    setName("");
    setStart("");
    setEnd("");
    setDrawerOpen(true);
    command.clearError();
  }

  function openEdit(period: Period) {
    setEditing(period);
    setName(period.name);
    setStart(period.start);
    setEnd(period.end);
    setDrawerOpen(true);
    command.clearError();
  }

  function closeDrawer() {
    if (command.busy) return;
    setDrawerOpen(false);
    setEditing(null);
    command.clearError();
  }

  function save() {
    if (!(editing ? canEdit : canCreate) || !name.trim() || !start || !end) return;
    if (editing?.closed) return;
    const isLockedDates = Boolean(editing?.in_use);
    const body = {
      name: name.trim(),
      start: isLockedDates && editing ? editing.start : start,
      end: isLockedDates && editing ? editing.end : end,
    };
    void command.run(
      workspace.companyPath(
        editing ? `financial-periods/${editing.id}` : "financial-periods",
      ),
      {
        method: editing ? "PATCH" : "POST",
        version: editing?.version,
        body,
      },
      () => {
        setDrawerOpen(false);
        setEditing(null);
        command.clearError();
        resource.refresh();
        workspace.refreshPeriods();
      },
      editing ? "دوره مالی به‌روزرسانی شد." : "دوره مالی جدید ایجاد شد.",
    );
  }

  function remove() {
    if (!canDelete || !deleting || deleting.in_use || deleting.closed) return;
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
    canCreate,
    canEdit,
    canDelete,
    resource,
    command,
    creating: drawerOpen,
    editing,
    deleting,
    name,
    start,
    end,
    setCreating: setDrawerOpen,
    setDeleting,
    setName,
    setStart,
    setEnd,
    openCreate,
    openEdit,
    closeCreate: closeDrawer,
    save,
    remove,
  };
}
