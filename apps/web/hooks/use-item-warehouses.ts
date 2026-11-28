"use client";

import { useState } from "react";
import type { InventoryItem, InventoryWarehouse } from "@/lib/inventory";
import { useCommand } from "./use-command";
import { useResource } from "./use-resource";
import { useWorkspace } from "./workspace";

interface ItemWarehouses {
  warehouse_ids: string[];
  can_link: boolean;
}

export function useItemWarehouses(warehouses: InventoryWarehouse[]) {
  const workspace = useWorkspace();
  const [item, setItem] = useState<InventoryItem>();
  const [warehouseId, setWarehouseId] = useState("");
  const path = item ? workspace.companyPath(`accounting/inventory/items/${item.id}/warehouses`) : null;
  const links = useResource<ItemWarehouses>(path);
  const command = useCommand();
  const linkedIds = new Set(links.data?.warehouse_ids);
  const linkedWarehouses = warehouses.filter((warehouse) => linkedIds.has(warehouse.id));
  const options = warehouses
    .filter((warehouse) => warehouse.active && !linkedIds.has(warehouse.id))
    .map((warehouse) => ({ value: warehouse.id, label: `${warehouse.name} · ${warehouse.code}` }));
  const canSave = !!links.data?.can_link && options.some((option) => option.value === warehouseId);

  function show(record: InventoryItem) {
    setItem(record);
    setWarehouseId("");
    command.clearError();
  }

  function save() {
    if (!canSave) return;
    void command.run<{ warehouse_id: string }>(path, { body: { warehouse_id: warehouseId } }, (result) => {
      if (links.data) {
        links.replace({ ...links.data, warehouse_ids: [...linkedIds, result.warehouse_id] });
      }
      setWarehouseId("");
      links.refresh();
    }, "کالا به انبار متصل شد.");
  }

  return {
    item, links, command, linkedWarehouses, options, warehouseId, canSave, show, save,
    select: (id: string) => { setWarehouseId(id); command.clearError(); },
    close: () => { if (!command.busy) setItem(undefined); },
  };
}
