"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { CounterpartyProfileDrawer, CounterpartyQuickDrawer } from "./commercial/counterparty-profile-drawer";
import { useTreasuryDocuments } from "@/hooks/use-treasury-documents";
import { TreasuryDocumentTable } from "./treasury-document-table";
import { TreasuryDocumentEditor } from "./treasury-document-editor";
import { TreasuryAllocationEditors } from "./treasury-allocation-editors";

export function TreasuryDocumentsPanel() {
  const view = useTreasuryDocuments();
  const {
    workspace,
    counterparties,
    cmd,
    setCreateOpen,
    setCreateClientError,
    partyQuickCreateOpen,
    setPartyQuickCreateOpen,
    viewingParty,
    setViewingParty,
    setPartyId,
  } = view;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium text-foreground">پیش‌نویس‌ها و اسناد دریافت و پرداخت چندابزاری خزانه</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink variant="secondary" href="/settings/treasury">
            مدیریت حساب‌های خزانه
          </ButtonLink>
          {workspace.canWrite && (
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

      <TreasuryDocumentTable view={view} />

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
          party={viewingParty}
          onClose={() => setViewingParty(null)}
        />
      )}
    </div>
  );
}
