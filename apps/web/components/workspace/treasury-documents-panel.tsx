"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/content-states";
import { CounterpartyProfileDrawer, CounterpartyQuickDrawer } from "./commercial/counterparty-profile-drawer";
import { useTreasuryDocuments } from "@/hooks/use-treasury-documents";
import { TreasuryDocumentTable } from "./treasury-document-table";
import { TreasuryDocumentEditor } from "./treasury-document-editor";
import { TreasuryAllocationEditors } from "./treasury-allocation-editors";

export function TreasuryDocumentsPanel() {
  const view = useTreasuryDocuments();
  const {
    canCreate,
    canView,
    cmd,
    setCreateOpen,
    setCreateClientError,
  } = view;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium text-foreground">اسناد خزانه</h2>
        <div className="flex flex-wrap items-center gap-2">
          {canView && (
            <ButtonLink variant="secondary" href="/settings/treasury">
              حساب‌های خزانه
            </ButtonLink>
          )}
          {canCreate && (
            <Button
              onClick={() => {
                cmd.clearError();
                setCreateClientError("");
                setCreateOpen(true);
              }}
            >
              <PlusIcon size={16} aria-hidden />
              ثبت پیش‌نویس سند خزانه
            </Button>
          )}
        </div>
      </div>

      {canView ? <TreasuryDocumentTable view={view} /> : <StatusMessage>دسترسی مشاهدهٔ اسناد خزانه ندارید.</StatusMessage>}

      <TreasuryDocumentDialogs view={view} />
    </div>
  );
}

export function TreasuryDocumentDialogs({ view, showNavigation = true }: { view: ReturnType<typeof useTreasuryDocuments>; showNavigation?: boolean }) {
  const { counterparties, partyQuickCreateOpen, setPartyQuickCreateOpen, viewingParty, setViewingParty, setPartyId } = view;
  return (
    <>
      <TreasuryDocumentEditor view={view} />

      <TreasuryAllocationEditors view={view} />

      <CounterpartyQuickDrawer
        open={partyQuickCreateOpen}
        initialMode="create"
        onOpenChange={setPartyQuickCreateOpen}
        onCreated={(created) => {
          counterparties.refresh();
          setPartyId(created.id);
        }}
      />
      {viewingParty && (
        <CounterpartyProfileDrawer
          showNavigation={showNavigation}
          party={viewingParty}
          onClose={() => setViewingParty(null)}
        />
      )}
    </>
  );
}
