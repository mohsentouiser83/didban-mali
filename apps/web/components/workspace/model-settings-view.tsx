"use client";
import { BrainIcon as HeaderIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/content-states";
import { useWorkspace } from "@/hooks/workspace";
import { ModelAdministration } from "./model-administration";
import { PageHeader, Panel } from "./page-parts";

export function ModelSettingsView() {
  const { user } = useWorkspace();
  return (
    <>
      <PageHeader icon={HeaderIcon} title="مدل هوش مصنوعی" />
      {user?.installation_admin ? (
        <ModelAdministration />
      ) : (
        <Panel>
          <EmptyState title="تنظیم مدل با مدیر نصب است" />
        </Panel>
      )}
    </>
  );
}
