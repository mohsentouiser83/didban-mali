"use client";
import { FilesIcon, BellIcon } from "@phosphor-icons/react";
import { useWorkspace } from "@/hooks/workspace";
import { BotNotificationsPanel } from "./bot-notifications-panel";
import { BotIntakesPanel } from "./bot-intakes-panel";
import { NoCompany, PageHeader } from "./page-parts";
export function BotConnectionDocumentsView() {
  const w = useWorkspace();
  return w.company ? (
    <>
      <PageHeader title="مدارک بات" icon={FilesIcon} />
      <BotIntakesPanel key={`${w.user?.id}:${w.company.id}`} />
    </>
  ) : (
    <NoCompany />
  );
}
export function BotConnectionNotificationsView() {
  const w = useWorkspace();
  return w.company ? (
    <>
      <PageHeader title="اعلان‌های بات" icon={BellIcon} />
      <BotNotificationsPanel />
    </>
  ) : (
    <NoCompany />
  );
}
