"use client";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Select } from "@/components/ui/select";
import { useWorkspace } from "@/hooks/workspace";
import { moduleRoutes } from "@/lib/company-modules";
import { navigationGroups } from "@/lib/navigation-catalog";
import { cn } from "@/lib/utils";
import {
  BellIcon,
  BuildingsIcon,
  ChartLineUpIcon,
  ListIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ModuleGate } from "./module-gate";
import { FloatingAssistant } from "./floating-assistant";
import { SettingsMenu } from "./settings-menu";
import { HeaderAccountMenu } from "./header-account-menu";
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { modules } = useWorkspace();
  return (
    <nav aria-label="ناوبری اصلی" className="space-y-6 text-xs">
      {navigationGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-[11px] text-muted">{group.label}</p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const companyModule = modules.data?.items.find(value => value.key === moduleRoutes[item.href]);
              const current =
                pathname === item.href ||
                (item.href === "/review" && (pathname.startsWith("/review/") || pathname === "/accounting" || pathname.startsWith("/accounting/"))) ||
                (item.href === "/cashflow/forecast" && pathname === "/cashflow/scenarios") ||
                (item.href === "/receivables" && pathname === "/receivables/followups") ||
                (item.href === "/moadian" && pathname.startsWith("/moadian/")) ||
                (item.href === "/reports" && pathname.startsWith("/reports/")) ||
                (item.href === "/reports" && pathname === "/employee-reports") ||
                (item.href === "/settlements" &&
                  pathname.startsWith("/settlements/"));
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
                  <span className="min-w-0 flex-1">{item.label}</span>{companyModule && !companyModule.available && <span className="text-[10px] text-muted">{companyModule.enabled ? "پوشش ناقص" : "خاموش"}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const workspace = useWorkspace();
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
              <SettingsMenu key={workspace.company?.id || "no-company"} />
              <Link
                href="/notifications"
                aria-label="اعلان‌ها"
                className="grid size-11 place-items-center rounded-control text-primary outline-none transition-colors duration-200 ease-interface hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
              >
                <BellIcon size={22} />
              </Link>
              <HeaderAccountMenu
                name={workspace.user?.name || "حساب کاربری"}
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
          <div key={workspace.company?.id || "no-company"}><ModuleGate>{children}</ModuleGate></div>
        </main>
      </div>
      <FloatingAssistant key={workspace.company?.id || "no-company"} />
      <Drawer title="دیدبان مالی" open={menuOpen} onOpenChange={setMenuOpen}>
        <Navigation onNavigate={() => setMenuOpen(false)} />

      </Drawer>
    </div>
  );
}
