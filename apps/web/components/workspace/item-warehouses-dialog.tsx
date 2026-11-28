"use client";

import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import type { useItemWarehouses } from "@/hooks/use-item-warehouses";

export function ItemWarehousesDialog({ view }: { view: ReturnType<typeof useItemWarehouses> }) {
  const { links, item, command } = view;
  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => { if (!open) view.close(); }}
      title={item ? `انبارهای «${item.name}»` : "انبارهای کالا"}
      footer={links.data?.can_link && view.options.length > 0 && (
        <Button type="submit" form="item-warehouse-link" busy={command.busy} disabled={!view.canSave}>
          اتصال به انبار
        </Button>
      )}
    >
      {links.loading ? <LoadingState /> : links.error ? (
        <ErrorState message={links.error.message} onRetry={links.refresh} />
      ) : (
        <div className="space-y-4">
          {view.linkedWarehouses.length > 0 ? (
            <ul aria-label="انبارهای متصل" className="divide-y divide-border rounded-control border border-border">
              {view.linkedWarehouses.map((warehouse) => (
                <li key={warehouse.id} className="flex justify-between gap-3 px-3 py-2.5 text-sm">
                  <span>{warehouse.name}</span>
                  <bdi className="text-muted">{warehouse.code}</bdi>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">انباری متصل نشده است.</p>}
          {links.data?.can_link && (
            view.options.length > 0 ? (
              <Form id="item-warehouse-link" onSubmit={(event) => { event.preventDefault(); view.save(); }}>
                <Field id="item-warehouse" label="انبار">
                  <Select id="item-warehouse" value={view.warehouseId} onValueChange={view.select}
                    options={view.options} disabled={command.busy} searchable={view.options.length > 8} />
                </Field>
                <FormMessage error>{command.error?.message}</FormMessage>
              </Form>
            ) : <p className="text-sm text-muted">انباری برای اتصال موجود نیست.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
