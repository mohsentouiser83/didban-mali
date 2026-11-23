"use client";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { PageTransition } from "@/components/ui/page-transition";
import { Select } from "@/components/ui/select";
import { useWorkspace } from "@/hooks/workspace";
import { useSidebarNavigation } from "@/hooks/use-sidebar-navigation";
import { SidebarNavigation } from "./sidebar-navigation";
import { cn } from "@/lib/utils";
import {
  BuildingsIcon,
  CalendarBlankIcon,
  ChartLineUpIcon,
  ListIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { FloatingAssistant } from "./floating-assistant";
import { SettingsMenu } from "./settings-menu";
import { NotificationsMenu } from "./notifications-menu";
import { HeaderAccountMenu } from "./header-account-menu";

export function Shell({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarNav = useSidebarNavigation();
  const isAssistant =
    pathname === "/assistant" ||
    pathname.startsWith("/assistant/") ||
    pathname === "/chat";
  if (workspace.loading || (!workspace.user && !workspace.error))
    return (
      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-7">
        <LoadingState label="در حال بازکردن فضای کاری" />
      </main>
    );
  if (workspace.error)
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <ErrorState
          message={workspace.error}
          onRetry={() => location.reload()}
        />
      </main>
    );
  return (
    <div
      className={cn(
        "min-h-dvh",
        isAssistant && "h-dvh max-h-dvh overflow-hidden",
      )}
    >
      <a
        href="#main"
        className="sr-only z-100 rounded-control bg-surface p-3 focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        رفتن به محتوا
      </a>
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col border-e border-border bg-surface p-4 lg:flex">
        <Link
          href="/"
          className="mb-7 flex items-center gap-3 rounded-control px-3 pt-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="grid size-10 place-items-center rounded-control bg-primary text-white">
            <ChartLineUpIcon size={23} weight="duotone" aria-hidden />
          </span>
          <span className="font-display text-sm font-medium">
            دیدبان مالی
          </span>
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNavigation sidebarNav={sidebarNav} idPrefix="desktop-sidebar" />
        </div>
      </aside>
      <div
        className={cn(
          "lg:ms-60",
          isAssistant && "flex h-dvh max-h-dvh flex-col overflow-hidden",
        )}
      >
        <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-surface">
          <div className="flex min-h-20 items-center justify-between gap-3 px-5 sm:px-7">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Button
                variant="ghost"
                className="size-11 p-0 lg:hidden"
                aria-label="بازکردن ناوبری"
                onClick={() => setMenuOpen(true)}
              >
                <ListIcon size={24} />
              </Button>
              <div className="hidden size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary sm:grid">
                <BuildingsIcon size={20} />
              </div>
              {workspace.companies.length > 1 ? (
                <Select
                  value={workspace.company?.id || ""}
                  onValueChange={workspace.setCompany}
                  options={workspace.companies.map((company) => ({
                    value: company.id,
                    label: company.name,
                  }))}
                  label="شرکت فعال"
                  className="w-24 min-w-0 border-transparent px-1 text-xs sm:w-48 sm:text-sm"
                />
              ) : (
                <span className="truncate text-xs font-medium sm:text-sm">
                  {workspace.company?.name || "فضای کاری شما"}
                </span>
              )}

              <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />

              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <div className="hidden size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary sm:grid">
                  <CalendarBlankIcon size={20} aria-hidden />
                </div>
                {(workspace.periods || []).length > 0 ? (
                  <Select
                    value={workspace.periodId || "latest"}
                    onValueChange={(id) =>
                      workspace.setPeriodId(id === "latest" ? "" : id)
                    }
                    options={[
                      { value: "latest", label: "آخرین نتیجه" },
                      ...(workspace.periods || []).map((period) => ({
                        value: period.id,
                        label: period.name,
                      })),
                    ]}
                    label="دوره مالی"
                    className="w-28 min-w-0 px-2 text-xs sm:w-44 sm:px-3 sm:text-sm"
                  />
                ) : (
                  <span className="truncate text-xs text-muted sm:text-sm">
                    بدون دوره مالی
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-3">
              <SettingsMenu key={`settings-${workspace.company?.id || "no-company"}`} />
              <NotificationsMenu key={`notifications-${workspace.company?.id || "no-company"}`} />
              <HeaderAccountMenu
                name={workspace.user?.name || "حساب کاربری"}
                avatar={workspace.user?.avatar}
                onLogout={() => void workspace.logout()}
              />
            </div>
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            "mx-auto min-w-0 max-w-400 p-5 focus:outline-none sm:p-7",
            isAssistant &&
              "flex min-h-0 w-full flex-1 flex-col overflow-hidden p-4 sm:p-6",
          )}
        >
          <div
            key={workspace.company?.id || "no-company"}
            className={cn(
              "w-full",
              isAssistant && "flex min-h-0 flex-1 flex-col overflow-hidden",
            )}
          >
            <PageTransition
              className={cn(
                isAssistant && "flex min-h-0 flex-1 flex-col overflow-hidden",
              )}
            >
              {children}
            </PageTransition>
          </div>
        </main>
      </div>
      {!isAssistant && (
        <FloatingAssistant key={`assistant-${workspace.company?.id || "no-company"}`} />
      )}
      <Drawer title="دیدبان مالی" open={menuOpen} onOpenChange={setMenuOpen}>
        <SidebarNavigation
          sidebarNav={sidebarNav}
          idPrefix="mobile-sidebar"
          onNavigate={() => setMenuOpen(false)}
        />
      </Drawer>
    </div>
  );
}
