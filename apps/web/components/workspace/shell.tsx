"use client";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { PageTransition } from "@/components/ui/page-transition";
import { Select } from "@/components/ui/select";
import { useWorkspace } from "@/hooks/workspace";
import {
  useSidebarNavigation,
  type SidebarNavigationReturn,
} from "@/hooks/use-sidebar-navigation";
import {
  isCurrentNavItem,
  isItemOrChildActive,
  navigationGroups,
} from "@/lib/navigation-catalog";
import { cn } from "@/lib/utils";
import {
  BuildingsIcon,
  CalendarBlankIcon,
  CaretDownIcon,
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

interface NavigationProps {
  onNavigate?: () => void;
  sidebarNav?: SidebarNavigationReturn;
}

function Navigation({ onNavigate, sidebarNav: externalNav }: NavigationProps) {
  const pathname = usePathname();
  const { user } = useWorkspace();
  const internalNav = useSidebarNavigation();
  const sidebarNav = externalNav ?? internalNav;

  return (
    <nav aria-label="ناوبری اصلی" className="space-y-4 text-xs">
      {navigationGroups.map((group, groupIndex) => {
        const visibleItems = group.items.filter(
          (item) => !item.adminOnly || user?.installation_admin,
        );
        if (!visibleItems.length) return null;

        const isExpanded = sidebarNav.isGroupExpanded(group.label);
        const isGroupActive = sidebarNav.isGroupActive(group);
        const groupId = `sidebar-group-${groupIndex}`;

        return (
          <div key={group.label} className="space-y-1">
            <Button
              variant="ghost"
              onClick={() => sidebarNav.toggleGroup(group.label)}
              aria-expanded={isExpanded}
              aria-controls={groupId}
              aria-label={`${group.label} - ${isExpanded ? "بستن دسته‌بندی" : "باز کردن دسته‌بندی"}`}
              className={cn(
                "group/cat h-auto min-h-8 w-full justify-between gap-2 px-3 py-1.5 text-[11px] font-medium outline-none focus-visible:ring-offset-0",
                isGroupActive && !isExpanded
                  ? "[&>svg]:text-primary text-primary font-semibold"
                  : "[&>svg]:text-muted hover:[&>svg]:text-foreground text-muted",
              )}
            >
              <span className="flex items-center gap-2">
                <span>{group.label}</span>
                {isGroupActive && !isExpanded && (
                  <span
                    className="size-1.5 rounded-full bg-primary"
                    title="شامل صفحه فعال"
                    aria-label="شامل صفحه فعال"
                  />
                )}
              </span>
              <CaretDownIcon
                size={14}
                aria-hidden
                className={cn(
                  "shrink-0 transition-transform duration-200 ease-interface motion-reduce:transition-none",
                  isExpanded
                    ? "rotate-0"
                    : "rotate-90 rtl:rotate-90 ltr:-rotate-90",
                )}
              />
            </Button>

            <div
              id={groupId}
              role="region"
              aria-label={group.label}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-200 ease-interface motion-reduce:transition-none",
                isExpanded
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0 pointer-events-none",
              )}
            >
              <div className="overflow-hidden min-h-0">
                <div className="space-y-1 pt-0.5">
                  {visibleItems.map((item) => {
                    const hasChildren = !!item.children && item.children.length > 0;
                    if (hasChildren) {
                      const isSubExpanded = sidebarNav.isSubgroupExpanded(item.label);
                      const isSubActive = isItemOrChildActive(item, pathname);
                      const subId = `sidebar-subgroup-${item.label}`;
                      return (
                        <div key={item.label} className="space-y-1">
                          <Button
                            variant="ghost"
                            onClick={() => sidebarNav.toggleSubgroup(item.label)}
                            aria-expanded={isSubExpanded}
                            aria-controls={subId}
                            aria-label={`${item.label} - ${isSubExpanded ? "بستن دسته‌بندی" : "باز کردن دسته‌بندی"}`}
                            tabIndex={isExpanded ? 0 : -1}
                            className={cn(
                              "group/nav flex min-h-10 w-full items-center justify-between rounded-control px-3 py-2 outline-none transition-colors duration-200 ease-interface focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none text-xs",
                              isSubActive && !isSubExpanded
                                ? "bg-primary-soft font-medium text-primary"
                                : "text-muted hover:bg-canvas hover:text-foreground",
                            )}
                          >
                            <span className="flex items-center gap-3 min-w-0 flex-1">
                              <item.icon
                                size={20}
                                className="shrink-0 text-primary transition-transform duration-200 ease-interface motion-safe:group-hover/nav:scale-110 motion-safe:group-focus-visible/nav:scale-110 motion-reduce:transition-none"
                                weight={isSubActive ? "duotone" : "regular"}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 truncate text-start font-medium">{item.label}</span>
                              {isSubActive && !isSubExpanded && (
                                <span
                                  className="size-1.5 rounded-full bg-primary shrink-0"
                                  title="شامل صفحه فعال"
                                  aria-label="شامل صفحه فعال"
                                />
                              )}
                            </span>
                            <CaretDownIcon
                              size={14}
                              aria-hidden
                              className={cn(
                                "shrink-0 text-muted transition-transform duration-200 ease-interface motion-reduce:transition-none group-hover/nav:text-foreground",
                                isSubExpanded ? "rotate-0" : "rotate-90 rtl:rotate-90 ltr:-rotate-90",
                              )}
                            />
                          </Button>

                          <div
                            id={subId}
                            role="region"
                            aria-label={item.label}
                            className={cn(
                              "grid transition-[grid-template-rows,opacity] duration-200 ease-interface motion-reduce:transition-none",
                              isSubExpanded
                                ? "grid-rows-[1fr] opacity-100"
                                : "grid-rows-[0fr] opacity-0 pointer-events-none",
                            )}
                          >
                            <div className="overflow-hidden min-h-0">
                              <div className="space-y-0.5 py-1 pr-4 mr-3 border-r border-border/70 rtl:pr-4 rtl:mr-3 ltr:pl-4 ltr:ml-3 ltr:border-l ltr:border-r-0">
                                {item.children?.map((child) => {
                                  const isChildCurrent = isCurrentNavItem(child.href, pathname);
                                  const ChildIcon = child.icon ?? item.icon;
                                  return (
                                    <Link
                                      key={child.href}
                                      href={child.href}
                                      onClick={onNavigate}
                                      tabIndex={isExpanded && isSubExpanded ? 0 : -1}
                                      aria-current={isChildCurrent ? "page" : undefined}
                                      aria-hidden={!isExpanded || !isSubExpanded}
                                      className={cn(
                                        "group/subnav flex min-h-9 items-center gap-2.5 rounded-control px-2.5 py-1.5 outline-none transition-colors duration-200 ease-interface focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none text-xs",
                                        isChildCurrent
                                          ? "bg-primary-soft font-semibold text-primary"
                                          : "text-muted hover:bg-canvas hover:text-foreground",
                                      )}
                                    >
                                      <ChildIcon
                                        size={16}
                                        className="shrink-0 text-primary transition-transform duration-200 ease-interface motion-safe:group-hover/subnav:scale-110 motion-reduce:transition-none"
                                        weight={isChildCurrent ? "duotone" : "regular"}
                                        aria-hidden
                                      />
                                      <span className="min-w-0 flex-1 truncate">{child.label}</span>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    const current = isCurrentNavItem(item.href, pathname);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        tabIndex={isExpanded ? 0 : -1}
                        aria-current={current ? "page" : undefined}
                        aria-hidden={!isExpanded}
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
          <Navigation sidebarNav={sidebarNav} />
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
              <Link
                href="/uploads"
                aria-label="بارگذاری فایل‌ها"
                title="بارگذاری و پردازش منابع"
                className="grid size-11 place-items-center rounded-control text-primary outline-none transition-colors duration-200 ease-interface hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none"
              >
                <UploadSimpleIcon size={20} />
              </Link>
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
            <ModuleGate>
              <PageTransition
                className={cn(
                  isAssistant && "flex min-h-0 flex-1 flex-col overflow-hidden",
                )}
              >
                {children}
              </PageTransition>
            </ModuleGate>
          </div>
        </main>
      </div>
      {!isAssistant && (
        <FloatingAssistant key={`assistant-${workspace.company?.id || "no-company"}`} />
      )}
      <Drawer title="دیدبان مالی" open={menuOpen} onOpenChange={setMenuOpen}>
        <Navigation
          sidebarNav={sidebarNav}
          onNavigate={() => setMenuOpen(false)}
        />
      </Drawer>
    </div>
  );
}
