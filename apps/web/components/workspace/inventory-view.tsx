"use client";

import { PackageIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { FormMessage } from "@/components/ui/field";
import type { InventoryCardexScope } from "@/hooks/use-inventory-cardex";
import { useInventoryOverview } from "@/hooks/use-inventory";
import { useWorkspace } from "@/hooks/workspace";
import { inventoryInvoicePath, inventoryTitle, type InventoryOperation } from "@/lib/inventory";
import { displayDate, persian } from "@/lib/utils";
import { InventoryDraftDrawer } from "./inventory-draft-drawer";
import { InventoryStockDraftDrawer } from "./inventory-stock-draft-drawer";
import { InventoryNrvDrawer } from "./inventory-nrv-drawer";
import {
  InventoryBalanceTable,
  InventoryKardexDrawer,
} from "./inventory-stock-tables";
import { JournalPostingLines } from "./journal-posting-lines";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { PostingReviewDialog } from "./posting-review-dialog";

export function InventoryView({ initialWarehouse }: { initialWarehouse?: string }) {
  const workspace = useWorkspace();
  return workspace.company ? (
    <InventoryWorkspace key={`${workspace.user?.id}:${workspace.company.id}:${initialWarehouse || ""}`} initialWarehouse={initialWarehouse} />
  ) : <NoCompany />;
}

function InventoryWorkspace({ initialWarehouse }: { initialWarehouse?: string }) {
  const view = useInventoryOverview(initialWarehouse);
  const [editor, setEditor] = useState<{ kind: InventoryOperation; open: boolean; generation: number }>();
  const [kardexTarget, setKardexTarget] = useState<InventoryCardexScope | null>(null);
  const [nrvOpen, setNrvOpen] = useState(false);
  const [stockDraftOpen, setStockDraftOpen] = useState(false);
  const openDraft = (kind: InventoryOperation) =>
    setEditor((previous) => ({ kind, open: true, generation: (previous?.generation ?? 0) + 1 }));
  const closeDraft = () =>
    setEditor((previous) => previous && { ...previous, open: false });
  const data = view.inventory.data;
  const canPost = view.capabilities.data?.can_post && view.capabilities.data.posting_available;
  const canCreate = view.canCreate;
  const journal = view.journal.resource;

  return (
    <>
      <PageHeader
        title="موجودی و کاردکس"
        icon={PackageIcon}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {data?.can_prepare && (
              <>
                <Button
                  disabled={!canCreate}
                  onClick={() => openDraft("purchase_goods")}
                >
                  خرید کالا
                </Button>
                <Button
                  variant="secondary"
                  disabled={!canCreate}
                  onClick={() => openDraft("sale_goods")}
                >
                  فروش کالا
                </Button>
                <Button variant="secondary" disabled={!canCreate} onClick={() => setStockDraftOpen(true)}>
                  سایر گردش‌های انبار
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setNrvOpen(true)}
                >
                  ارزیابی کاهش ارزش (استاندارد ۸)
                </Button>
              </>
            )}
          </div>
        }
      />
      {view.inventory.loading ? (
        <LoadingState label="در حال دریافت موجودی و گردش کالا" variant="panels" />
      ) : view.inventory.error ? (
        <ErrorState message={view.inventory.error.message} />
      ) : data && (
        <div className="space-y-5">
          {data.can_prepare && view.accounts.error && (
            <ErrorState message={view.accounts.error.message} />
          )}
          {data.can_prepare && !canCreate && !view.accounts.loading && !view.accounts.error && (
            <StatusMessage>برای شروع، کالا، انبار، حساب فعال و دورهٔ مالی تعریف کنید.</StatusMessage>
          )}
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
          <div className="space-y-6">
            <InventoryBalanceTable
              view={view}
              onViewKardex={(itemId, warehouseId) => setKardexTarget({
                itemId: itemId ?? (view.itemId === view.all ? undefined : view.itemId),
                warehouseId: warehouseId ?? (view.warehouseId === view.all ? undefined : view.warehouseId),
                asOf: view.asOf,
              })}
            />
          </div>
          {kardexTarget && <InventoryKardexDrawer view={view} target={kardexTarget} onClose={() => setKardexTarget(null)} />}
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
          {stockDraftOpen && (
            <InventoryStockDraftDrawer inventory={data} accounts={view.accounts.options}
              onClose={() => setStockDraftOpen(false)} />
          )}
          <InventoryNrvDrawer
            open={nrvOpen}
            onOpenChange={setNrvOpen}
            accounts={view.accounts.options}
            onDraftCreated={() => view.inventory.refresh()}
          />
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
          <ErrorState message={journal.error.message} />
        ) : journal.data && (
          <div className="space-y-4">
            <p className="font-medium">{journal.data.snapshot.description}</p>
            <p className="text-sm text-muted">
              سند {persian(journal.data.sequence)} · {displayDate(journal.data.date)} · نسخه {persian(journal.data.draft_version)}
            </p>
            <JournalPostingLines lines={journal.data.snapshot.lines} />
          </div>
        )}
      </Drawer>
    </>
  );
}
