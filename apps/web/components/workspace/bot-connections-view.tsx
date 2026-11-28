"use client";

import { useState } from "react";
import { PlugsConnectedIcon } from "@phosphor-icons/react";
import type { BotConnection } from "@/lib/bot-connections";
import { useBotConnections } from "@/hooks/use-bot-connections";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { BotProviderPanel } from "./bot-provider-panel";
import { NoCompany, PageHeader } from "./page-parts";

export function BotConnectionsView() {
  const controller = useBotConnections();
  return <BotConnectionsContent key={controller.scopeKey} view={controller} />;
}

function BotConnectionsContent({
  view,
}: {
  view: ReturnType<typeof useBotConnections>;
}) {
  const [disconnect, setDisconnect] = useState<BotConnection>();
  if (!view.company) return <NoCompany />;
  return (
    <>
      <PageHeader
        title="اتصال‌ها"
        icon={PlugsConnectedIcon}
      />
      {view.loading ? (
        <LoadingState label="در حال دریافت اتصال‌ها" variant="panels" />
      ) : view.error ? (
        <ErrorState message={view.error.message} />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {view.cards.map((card) => (
            <BotProviderPanel
              key={card.provider}
              card={card}
              busy={view.busy}
              pendingAction={
                view.pendingAction?.provider === card.provider
                  ? view.pendingAction.kind
                  : undefined
              }
              onCreate={() => void view.create(card.provider)}
              onCopy={() => void view.copy(card.provider)}
              onConfirm={(connection) => void view.confirm(connection)}
              onDisconnect={(connection) => {
                view.clearError();
                setDisconnect(connection);
              }}
            />
          ))}
        </div>
      )}
      {!disconnect && (
        <div className="mt-4">
          <FormMessage error>{view.operationError?.message}</FormMessage>
        </div>
      )}
      <ConfirmDialog
        open={!!disconnect}
        onOpenChange={(open) => {
          if (!open) setDisconnect(undefined);
        }}
        title={
          disconnect?.state === "active" ? "قطع اتصال حساب" : "لغو اتصال ناتمام"
        }
        busy={view.busy}
        onConfirm={() => {
          if (disconnect)
            void view.revoke(disconnect).then((success) => {
              if (success) setDisconnect(undefined);
            });
        }}
      >
        <p className="text-sm leading-7">
          {disconnect?.state === "active"
            ? "دسترسی این حساب به بات قطع شود؟"
            : "درخواست اتصال این حساب لغو شود؟"}
        </p>
        <div className="mt-4">
          <FormMessage error>{view.operationError?.message}</FormMessage>
        </div>
        {view.operationError?.status === 409 && (
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              view.clearError();
              setDisconnect(undefined);
            }}
          >
            بازبینی اتصال
          </Button>
        )}
      </ConfirmDialog>
    </>
  );
}
