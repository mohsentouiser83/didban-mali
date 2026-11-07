"use client";
import { useState } from "react";
import { useWorkspace } from "./workspace";
import { useCommand } from "./use-command";
import { usePagedResource } from "./use-paged-resource";
import { type Period } from "@/lib/api";
export function usePeriodManagement() {
  const workspace = useWorkspace();
  const resource = usePagedResource<Period>(
    workspace.companyPath("financial-periods"),
  );
  const command = useCommand();
  const [editing, setEditing] = useState<Period | null | undefined>();
  const [locking, setLocking] = useState<Period | null>(null);
  const [deleting, setDeleting] = useState<Period | null>(null);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [previousPeriodId, setPreviousPeriodId] = useState("");
  const comparisonOptions = workspace.periods.filter(
    (period) => period.id !== editing?.id && !!start && period.end < start,
  );
  const comparisonInvalid =
    !!previousPeriodId &&
    !comparisonOptions.some((period) => period.id === previousPeriodId);
  function open(period: Period | null) {
    setEditing(period);
    setName(period?.name || "");
    setStart(period?.start || "");
    setEnd(period?.end || "");
    setPreviousPeriodId(period?.previous_period_id || "");
    command.clearError();
  }
  function save() {
    if (!name.trim() || !start || !end) return;
    void command.run(
      workspace.companyPath(
        "financial-periods" + (editing ? `/${editing.id}` : ""),
      ),
      {
        method: editing ? "PATCH" : "POST",
        body: {
          name: name.trim(),
          start,
          end,
          previous_period_id: previousPeriodId || null,
        },
        version: editing?.version,
      },
      () => {
        setEditing(undefined);
        resource.refresh();
        workspace.refreshPeriods();
      },
      "دوره مالی ذخیره شد.",
    );
  }

  function remove() {
    if (!deleting) return;
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
    editing,
    locking,
    deleting,
    name,
    start,
    end,
    previousPeriodId,
    comparisonOptions,
    comparisonInvalid,
    setEditing,
    setLocking,
    setDeleting,
    setName,
    setStart,
    setEnd,
    setPreviousPeriodId,
    open,
    save,
    remove,
  };
}
