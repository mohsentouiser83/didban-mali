"use client";

import { PackageIcon, StorefrontIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useInventoryOverview } from "@/hooks/use-inventory";
import { useWorkspace } from "@/hooks/workspace";
import { inventoryInvoicePath, inventoryTitle, type InventoryOperation } from "@/lib/inventory";
import { displayDate, persian } from "@/lib/utils";
import { InventoryDraftDrawer } from "./inventory-draft-drawer";
import { InventoryBalanceTable, InventoryMovementTable } from "./inventory-stock-tables";
import { JournalPostingLines } from "./journal-posting-lines";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { PostingReviewDialog } from "./posting-review-dialog";

export function InventoryView() {
  const workspace = useWorkspace();
  return workspace.company ? (
    <InventoryWorkspace key={`${workspace.user?.id}:${workspace.company.id}`} />
  ) : <NoCompany />;
}

function InventoryWorkspace() {
  const view = useInventoryOverview();
  const [editor, setEditor] = useState<{ kind: InventoryOperation; open: boolean; generation: number }>();
  const openDraft = (kind: InventoryOperation) =>
    setEditor((previous) => ({ kind, open: true, generation: (previous?.generation ?? 0) + 1 }));
  const closeDraft = () =>
    setEditor((previous) => previous && { ...previous, open: false });
  const data = view.inventory.data;
  const canPost = view.capabilities.data?.can_post && view.capabilities.data.posting_available;
  const canCreate = !!data?.items.length && !!data.warehouses.length && view.workspace.periods.length > 0 &&
    !view.accounts.loading && !view.accounts.error && view.accounts.options.length > 0;
  const journal = view.journal.resource;

  return (
    <>
      <PageHeader
        title="موجودی و گردش کالا"
        icon={PackageIcon}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/accounting" variant="secondary">اسناد حسابداری</ButtonLink>
            <ButtonLink href="/accounting/inventory/items" variant="secondary">کالاها</ButtonLink>
            <ButtonLink href="/accounting/inventory/warehouses" variant="secondary">انبارها</ButtonLink>
          </div>
        }
      />
      {view.inventory.loading ? (
        <LoadingState label="در حال دریافت موجودی و گردش کالا" variant="panels" />
      ) : view.inventory.error ? (
        <ErrorState message={view.inventory.error.message} onRetry={view.inventory.refresh} />
      ) : data && (
        <div className="space-y-5">
          <Panel
            title="خرید و فروش کالا"
            action={data.can_prepare && (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!canCreate || !data.purchase_enabled}
                  onClick={() => openDraft("purchase_goods")}
                >
                  خرید کالا
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canCreate || !data.sale_enabled}
                  onClick={() => openDraft("sale_goods")}
                >
                  فروش کالا
                </Button>
              </div>
            )}
          >
            {data.can_prepare && view.accounts.error && (
              <ErrorState message={view.accounts.error.message} onRetry={view.accounts.refresh} />
            )}
            {data.can_prepare && !canCreate && !view.accounts.loading && !view.accounts.error && (
              <StatusMessage>برای شروع، کالا، انبار، حساب فعال و دورهٔ مالی تعریف کنید.</StatusMessage>
            )}
            {data.can_prepare && (!data.purchase_enabled || !data.sale_enabled) && (
              <StatusMessage>
                {data.purchase_enabled ? "فروش کالا" : data.sale_enabled ? "خرید کالا" : "خرید و فروش کالا"} در ماژول‌های شرکت غیرفعال است.
              </StatusMessage>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <Field id="inventory-filter-item" label="کالا" icon={PackageIcon}>
                <Select
                  id="inventory-filter-item"
                  label="فیلتر کالا"
                  value={view.itemId}
                  onValueChange={view.chooseItem}
                  options={[
                    { value: view.all, label: "همهٔ کالاها" },
                    ...data.items.map((item) => ({ value: item.id, label: item.name })),
                  ]}
                  className="sm:w-48"
                />
              </Field>
              <Field id="inventory-filter-warehouse" label="انبار" icon={StorefrontIcon}>
                <Select
                  id="inventory-filter-warehouse"
                  label="فیلتر انبار"
                  value={view.warehouseId}
                  onValueChange={view.chooseWarehouse}
                  options={[
                    { value: view.all, label: "همهٔ انبارها" },
                    ...data.warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
                  ]}
                  className="sm:w-48"
                />
              </Field>
              {(view.itemId !== view.all || view.warehouseId !== view.all) && (
                <Button variant="ghost" onClick={view.resetFilters}>پاک‌کردن فیلتر</Button>
              )}
            </div>
          </Panel>
          {view.pending && (
            <Panel title="آخرین عملیات">
              <div className="flex flex-wrap items-center gap-3" aria-live="polite">
                <span className="min-w-0 wrap-anywhere">
                  {inventoryTitle[view.pending.kind]} · <bdi>{view.pending.reference}</bdi>
                </span>
                <Badge tone={view.pending.posted ? "success" : "warning"}>
                  {view.pending.posted ? "ثبت نهایی شد" : "پیش‌نویس"}
                </Badge>
                {view.pending.posted ? (
                  <ButtonLink href={inventoryInvoicePath(view.pending.kind, view.pending.operationId)} variant="secondary">
                    فاکتور و تسویه
                  </ButtonLink>
                ) : canPost ? (
                  <Button onClick={view.review} busy={view.posting.loading}>بررسی و ثبت نهایی</Button>
                ) : (
                  <ButtonLink href="/accounting" variant="secondary">مشاهده پیش‌نویس در اسناد</ButtonLink>
                )}
              </div>
              <FormMessage error>{view.posting.error?.message}</FormMessage>
            </Panel>
          )}
          <InventoryBalanceTable view={view} />
          <InventoryMovementTable view={view} />
          {editor && (
            <InventoryDraftDrawer
              key={editor.generation}
              kind={editor.kind}
              open={editor.open}
              inventory={data}
              accounts={view.accounts.options}
              onClose={closeDraft}
              onCreated={view.onDraftCreated}
            />
          )}
        </div>
      )}
      <PostingReviewDialog view={view.posting} />
      <Drawer
        title="سند نهایی گردش کالا"
        open={!!view.journal.selected}
        onOpenChange={(open) => {
          if (!open) view.journal.select(undefined);
        }}
        className="sm:max-w-2xl"
      >
        {journal.loading ? <LoadingState variant="message" /> : journal.error ? (
          <ErrorState message={journal.error.message} onRetry={journal.refresh} />
        ) : journal.data && (
          <div className="space-y-4">
            <p className="font-medium">{journal.data.snapshot.description}</p>
            <p className="text-sm text-muted">
              سند {persian(journal.data.sequence)} · {displayDate(journal.data.date)} · نسخه {persian(journal.data.draft_version)}
            </p>
            <JournalPostingLines lines={journal.data.snapshot.lines} />
            <ButtonLink href="/accounting/journals" variant="secondary">دفتر اصلی دیدبان</ButtonLink>
          </div>
        )}
      </Drawer>
    </>
  );
}
