"use client";

import { useState } from "react";
import { inventoryUnitsPath, type InventoryUnits } from "@/lib/inventory";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

export function useInventoryUnits() {
  const workspace = useWorkspace();
  const path = workspace.companyPath(inventoryUnitsPath);
  const units = useResource<InventoryUnits>(path);
  const command = useCommand();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const canAdd = units.data?.can_create === true;
  const canSave = canAdd && name.trim().length > 0;

  return {
    units,
    command,
    canAdd,
    canSave,
    open,
    name,
    show() {
      setName("");
      command.clearError();
      setOpen(true);
    },
    close() {
      if (!command.busy) setOpen(false);
    },
    change(value: string) {
      setName(value);
      command.clearError();
    },
    save() {
      if (!canSave) return;
      void command.run(path, { body: { name: name.trim() } }, () => {
        setOpen(false);
        units.refresh();
      }, "واحد اضافه شد.");
    },
  };
}
