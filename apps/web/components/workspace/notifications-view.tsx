"use client";
import { BellIcon as HeaderIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/content-states";
import { FormMessage } from "@/components/ui/field";
import { useCommand } from "@/hooks/use-command";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import { listItems, type AppNotification, type ResourceList } from "@/lib/api";
import { displayDate } from "@/lib/utils";
import { ArrowUpLeftIcon, BellIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function NotificationsView() {
  const workspace = useWorkspace();
  const resource = useResource<ResourceList<AppNotification>>(
    workspace.companyPath("notifications"),
  );
  const command = useCommand();
  if (!workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader icon={HeaderIcon} title="اعلان‌ها" />
      <Panel>
        {resource.loading ? (
          <LoadingState />
        ) : resource.error ? (
          <ErrorState
            message={resource.error.message}
            onRetry={resource.refresh}
          />
        ) : listItems(resource.data).length ? (
          <div className="divide-y divide-border">
            {listItems(resource.data).map((notification) => (
              <div
                key={notification.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <BellIcon size={20} aria-hidden className="mt-1 shrink-0 text-primary" />
                  <div>
                  <p
                    className={notification.read ? "text-muted" : "font-medium"}
                  >
                    {notification.title}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {displayDate(notification.created_at)}
                  </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {notification.href?.startsWith("/") && (
                    <ButtonLink href={notification.href} variant="soft">
                      مشاهده<ArrowUpLeftIcon size={16} aria-hidden />
                    </ButtonLink>
                  )}
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      disabled={command.busy}
                      onClick={() =>
                        void command.run(
                          workspace.companyPath(
                            `notifications/${notification.id}`,
                          ),
                          {
                            method: "PATCH",
                            body: { read: true },
                            version: notification.version,
                          },
                          resource.refresh,
                        )
                      }
                      aria-label="علامت‌گذاری به‌عنوان خوانده‌شده"
                    >
                      <CheckCircleIcon size={20} className="text-primary" aria-hidden />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="اعلان تازه‌ای نیست" />
        )}
        <FormMessage error>{command.error?.message}</FormMessage>
      </Panel>
    </>
  );
}
