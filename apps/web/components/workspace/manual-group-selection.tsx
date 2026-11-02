"use client";
import { Field } from "@/components/ui/field";
import { SearchSelect } from "@/components/ui/search-select";
import { CursorPagination } from "@/components/ui/pagination";
import type { ManualGroupController } from "@/hooks/use-manual-groups";
import { persian } from "@/lib/utils";
import { ReconciliationSelectedRows } from "./reconciliation-selected-rows";

export function ManualGroupSelection({
  view, side,
}: {
  view: ManualGroupController;
  side: "bank" | "ledger";
}) {
  const bank = side === "bank";
  const rows = bank ? view.current.banks : view.current.ledgers;
  const resource = bank ? view.bankOptions : view.ledgerOptions;
  const label = bank ? "گردش بانک" : "ردیف بانکی دفتر";
  return (
    <section className="space-y-3">
      <h3 className="font-medium">{label} · {persian(rows.length)} انتخاب</h3>
      {view.workspace.canWrite && (
        <>
          <Field id={`manual-${side}`} label={`افزودن ${label}`}>
            <SearchSelect
              id={`manual-${side}`}
              value=""
              query={view.query[side]}
              onQueryChange={value => view.queryChange(side, value)}
              onValueChange={value => view.add(side, value)}
              options={bank ? view.bankChoices : view.ledgerChoices}
              loading={resource.loading}
              error={resource.error?.message}
              hasMore={resource.hasNext}
              disabled={view.command.busy || rows.length >= 100}
              searchLabel={`جستجوی ${label}`}
            />
          </Field>
          <CursorPagination {...resource} />
        </>
      )}
      <ReconciliationSelectedRows rows={rows} canRemove={view.workspace.canWrite} busy={view.command.busy} onRemove={id => view.remove(side, id)} />
    </section>
  );
}
