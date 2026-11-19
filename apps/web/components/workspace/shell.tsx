"use client";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { PageTransition } from "@/components/ui/page-transition";
import { Select } from "@/components/ui/select";
import { useWorkspace } from "@/hooks/workspace";
import { navigationGroups } from "@/lib/navigation-catalog";
import { cn } from "@/lib/utils";
import {
  BuildingsIcon,
  ChartLineUpIcon,
  ListIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ModuleGate } from "./module-gate";
import { FloatingAssistant } from "./floating-assistant";
import { SettingsMenu } from "./settings-menu";
import { NotificationsMenu } from "./notifications-menu";
import { HeaderAccountMenu } from "./header-account-menu";
function isCurrentNavItem(itemHref: string, pathname: string) {
  if (pathname === itemHref) return true;
  if (itemHref === "/accounting") {
    return (
      pathname.startsWith("/accounting/journals") ||
      pathname.startsWith("/accounting/operations") ||
      pathname.startsWith("/accounting/period-end")
    );
  }
  if (itemHref === "/accounting/inventory") {
    return pathname.startsWith("/accounting/inventory/");
  }
  if (itemHref === "/receivables") {
    return pathname === "/receivables/followups";
  }
  if (itemHref === "/reports") {
    return pathname.startsWith("/reports/") && pathname !== "/employee-reports";
  }
  if (itemHref === "/employee-reports") {
    return (
      pathname.startsWith("/employee-reports/") ||
      pathname === "/employees" ||
      pathname.startsWith("/employees/")
    );
  }
  if (itemHref === "/settlements") {
    return pathname.startsWith("/settlements/");
  }
  if (itemHref === "/moadian") {
    return pathname.startsWith("/moadian/");
  }
  if (itemHref === "/cashflow") {
    return pathname.startsWith("/cashflow/");
  }
  if (itemHref === "/assistant") {
    return pathname.startsWith("/assistant/");
  }
  if (itemHref === "/review") {
    return pathname.startsWith("/review/");
  }
  if (itemHref === "/sources") {
    return pathname.startsWith("/sources/") || pathname.startsWith("/uploads");
  }
  if (itemHref.startsWith("/settings/")) {
    return pathname.startsWith(itemHref + "/");
  }
  return false;
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useWorkspace();
  return (
    <nav aria-label="ناوبری اصلی" className="space-y-6 text-xs">
      {navigationGroups.map((group) => {
        const visibleItems = group.items.filter(
          (item) => !item.adminOnly || user?.installation_admin,
        );
        if (!visibleItems.length) return null;
        return (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[11px] text-muted">{group.label}</p>
            <div className="space-y-1">
              {visibleItems.map((item) => {
                const current = isCurrentNavItem(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "group/nav flex min-h-11 items-center gap-3 rounded-control px-3 py-2 outline-none transition-colors duration-200 ease-interface focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none",
                      current
                        ? "bg-primary-soft font-medium text-primary"
                        : "text-muted hover:bg-canvas hover:text-foreground",
                    )}
                  >
                    <item.icon
                      size={20}
                      className="shrink-0 text-primary transition-transform duration-200 ease-interface motion-safe:group-hover/nav:scale-110 motion-safe:group-focus-visible/nav:scale-110 motion-reduce:transition-none"
                      weight={current ? "duotone" : "regular"}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {item.badge && (
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide transition-colors duration-200",
                          current
                            ? "bg-primary text-white"
                            : "bg-primary-soft text-primary group-hover/nav:bg-primary group-hover/nav:text-white",
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
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
    <div className="min-h-dvh">
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
          <Navigation />
        </div>
      </aside>
      <div className="lg:ms-60">
        <header className="sticky top-0 z-20 border-b border-border bg-surface">
          <div className="flex min-h-20 items-center justify-between gap-3 px-5 sm:px-7">
            <div className="flex min-w-0 items-center gap-3">
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
                  className="w-24 min-w-0 border-transparent px-1 text-xs sm:w-56 sm:text-sm"
                />
              ) : (
                <span className="truncate font-medium">
                  {workspace.company?.name || "فضای کاری شما"}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-3">
              <Link
                href="/uploads"
                aria-label="بارگذاری فایل‌ها"
                title="بارگذاری و پردازش منابع"
                className="grid size-11 place-items-center rounded-control text-primary outline-none transition-colors duration-200 ease-interface hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
              >
                <UploadSimpleIcon size={20} />
              </Link>
              <SettingsMenu key={workspace.company?.id || "no-company"} />
              <NotificationsMenu key={workspace.company?.id || "no-company"} />
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
          className="mx-auto min-w-0 max-w-400 p-5 focus:outline-none sm:p-7"
        >
          <div key={workspace.company?.id || "no-company"}>
            <ModuleGate>
              <PageTransition>{children}</PageTransition>
            </ModuleGate>
          </div>
        </main>
      </div>
      {pathname !== "/assistant" && (
        <FloatingAssistant key={workspace.company?.id || "no-company"} />
      )}
      <Drawer title="دیدبان مالی" open={menuOpen} onOpenChange={setMenuOpen}>
        <Navigation onNavigate={() => setMenuOpen(false)} />

      </Drawer>
    </div>
  );
}
