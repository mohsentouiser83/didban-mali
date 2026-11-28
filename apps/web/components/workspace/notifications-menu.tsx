"use client";
import { useId, useState } from "react";
import {
  ArrowUpLeftIcon,
  BellIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import {
  api,
  listItems,
  type AppNotification,
  type ResourceList,
} from "@/lib/api";
import { cn, displayDate, persian } from "@/lib/utils";

export function NotificationsMenu() {
  const workspace = useWorkspace();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const resource = useResource<ResourceList<AppNotification>>(
    workspace.companyPath("notifications"),
  );

  const notifications = listItems(resource.data);
  const unreadItems = notifications.filter((item) => !item.read);
  const unreadCount = unreadItems.length;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      resource.refresh();
    }
  };

  const markAsRead = async (notification: AppNotification) => {
    if (busyId || !workspace.company) return;
    setBusyId(notification.id);
    try {
      await api(workspace.companyPath(`notifications/${notification.id}`)!, {
        method: "PATCH",
        body: { read: true },
        version: notification.version,
      });
      resource.refresh();
    } catch {
      // Error handled silently or through resource error state
    } finally {
      setBusyId(null);
    }
  };

  const markAllAsRead = async () => {
    if (markingAll || unreadCount === 0 || !workspace.company) return;
    setMarkingAll(true);
    try {
      await Promise.all(
        unreadItems.map((item) =>
          api(workspace.companyPath(`notifications/${item.id}`)!, {
            method: "PATCH",
            body: { read: true },
            version: item.version,
          }),
        ),
      );
      resource.refresh();
    } catch {
      // Error handled silently or through resource error state
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          aria-label={
            unreadCount > 0
              ? `اعلان‌ها (${persian(unreadCount)} خوانده‌نشده)`
              : "اعلان‌ها"
          }
          className={cn(
            "relative grid size-11 place-items-center rounded-control text-primary outline-none transition-colors duration-200 ease-interface hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none",
            open && "bg-primary-soft text-primary",
          )}
        >
          <BellIcon size={22} aria-hidden />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute top-1.5 start-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white shadow-xs"
            >
              {unreadCount > 9 ? "+۹" : persian(unreadCount)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-labelledby={titleId}
        className="flex w-84 max-h-[min(36rem,var(--radix-popover-content-available-height))] flex-col overflow-hidden rounded-2xl border-border/90 bg-surface/95 p-0 text-foreground shadow-2xl shadow-foreground/20 backdrop-blur-2xl sm:w-96"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-linear-to-r from-canvas via-primary-soft/20 to-canvas px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-linear-to-tr from-primary to-primary-hover text-white shadow-xs">
              <BellIcon size={16} aria-hidden />
            </span>
            <div className="flex items-center gap-2">
              <h2 id={titleId} className="text-sm font-medium leading-tight">
                اعلان‌ها
              </h2>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">
                  {persian(unreadCount)} جدید
                </span>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              disabled={markingAll}
              onClick={() => void markAllAsRead()}
              className="h-7 min-h-0 px-2 text-xs font-medium text-primary hover:bg-primary-soft/50"
            >
              <CheckCircleIcon size={14} aria-hidden />
              خواندن همه
            </Button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto divide-y divide-border/60">
          {!workspace.company ? (
            <div className="p-6 text-center text-sm text-muted">
              لطفاً ابتدا یک شرکت را انتخاب کنید.
            </div>
          ) : resource.loading && !resource.data ? (
            <div className="p-8">
              <LoadingState label="در حال دریافت اعلان‌ها" />
            </div>
          ) : resource.error ? (
            <div className="p-6">
              <ErrorState
                message={resource.error.message}
              />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <div className="grid size-12 place-items-center rounded-2xl bg-canvas text-muted">
                <BellIcon size={24} aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">
                اعلان تازه‌ای نیست
              </p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  "flex items-start gap-3 p-3.5 transition-colors",
                  notification.read
                    ? "bg-transparent hover:bg-canvas/60"
                    : "bg-primary-soft/25 hover:bg-primary-soft/35",
                )}
              >
                <div className="relative mt-0.5 shrink-0">
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-lg text-primary",
                      notification.read ? "bg-canvas" : "bg-primary-soft",
                    )}
                  >
                    <BellIcon size={16} aria-hidden />
                  </span>
                  {!notification.read && (
                    <span
                      aria-hidden
                      className="absolute -top-0.5 -start-0.5 size-2 rounded-full bg-primary ring-2 ring-surface"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-xs leading-relaxed",
                      notification.read
                        ? "text-muted"
                        : "font-medium text-foreground",
                    )}
                  >
                    {notification.title}
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    {displayDate(notification.created_at)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 self-center">
                  {notification.href?.startsWith("/") && (
                    <ButtonLink
                      href={notification.href.replace(/^\/uploads\/([^/]+)$/, "/reports/processing/$1")}
                      variant="soft"
                      onClick={() => {
                        if (!notification.read) void markAsRead(notification);
                        setOpen(false);
                      }}
                      className="h-7 min-h-0 px-2 text-xs"
                    >
                      مشاهده
                      <ArrowUpLeftIcon size={13} aria-hidden />
                    </ButtonLink>
                  )}
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      disabled={busyId === notification.id}
                      onClick={() => void markAsRead(notification)}
                      title="علامت‌گذاری به‌عنوان خوانده‌شده"
                      aria-label="علامت‌گذاری به‌عنوان خوانده‌شده"
                      className="size-7 min-h-0 rounded-lg p-0 text-muted hover:bg-canvas hover:text-foreground"
                    >
                      <CheckCircleIcon
                        size={18}
                        className="text-primary"
                        aria-hidden
                      />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
