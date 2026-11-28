"use client";

import type { ComponentProps } from "react";
import { Select } from "./select";
import { TableFilterPanel } from "./table-filter-popover";

export function TableColumnSelect({
  columnTitle,
  value,
  onValueChange,
  unfilteredValue = "all",
  ...props
}: Omit<ComponentProps<typeof Select>, "id" | "label"> & {
  columnTitle: string;
  unfilteredValue?: string;
}) {
  return (
    <TableFilterPanel columnTitle={columnTitle} isActive={value !== unfilteredValue}>
      {({ close }) => (
        <Select
          {...props}
          label={columnTitle}
          value={value}
          onValueChange={(next) => {
            onValueChange?.(next);
            close();
          }}
        />
      )}
    </TableFilterPanel>
  );
}
