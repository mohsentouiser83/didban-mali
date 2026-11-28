"use client";
import Link from "next/link";
import { CaretDownIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { SidebarNavigationReturn } from "@/hooks/use-sidebar-navigation";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import type { AccountingCapabilities } from "@/lib/accounting";
import { isCurrentNavItem, isItemOrChildActive, navigationGroups, type NavigationItem } from "@/lib/navigation-catalog";
import { canViewPath } from "@/lib/module-access";
import { cn } from "@/lib/utils";

interface NavigationProps {
  onNavigate?: () => void;
  sidebarNav: SidebarNavigationReturn;
  idPrefix: string;
}

export function SidebarNavigation({ onNavigate, sidebarNav, idPrefix }: NavigationProps) {
  const { pathname } = sidebarNav;
  const { company } = useWorkspace();
  const capabilities = useResource<AccountingCapabilities>(
    company ? `/companies/${company.id}/accounting/capabilities` : null,
  );
  const payrollDenied =
    company?.role === "viewer" || capabilities.data?.can_view_payroll === false;

  const canView = (href: string) => {
    if (
      payrollDenied &&
      ["/payroll", "/payroll/employees", "/payroll/contracts", "/employee-reports"].includes(href)
    ) {
      return false;
    }
    return canViewPath(company, href);
  };

  function renderItem(item: NavigationItem, isExpanded = true) {
    const children = item.children?.filter((child) => canView(child.href));
    if (item.children ? !children?.length : !canView(item.href)) return null;
    const hasChildren = !!children?.length;
    if (hasChildren) {
      const isSubExpanded = sidebarNav.isSubgroupExpanded(item.label);
      const isSubActive = isItemOrChildActive(item, pathname);
      const subId = `${idPrefix}-subgroup-${item.href.replaceAll("/", "-")}`;
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
              "group/nav flex min-h-11 w-full items-center justify-between rounded-control px-3 py-2 outline-none transition-colors duration-200 ease-interface focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none text-xs",
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
            aria-hidden={!isExpanded || !isSubExpanded}
            inert={!isExpanded || !isSubExpanded}
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-200 ease-interface motion-reduce:transition-none",
              isSubExpanded
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0 pointer-events-none",
            )}
          >
            <div className="overflow-hidden min-h-0">
              <div className="space-y-0.5 py-1 pr-4 mr-3 border-r border-border/70 rtl:pr-4 rtl:mr-3 ltr:pl-4 ltr:ml-3 ltr:border-l ltr:border-r-0">
                {children?.map((child: NavigationItem) => {
                  const isChildCurrent = isCurrentNavItem(child.href, pathname);
                  const ChildIcon = child.icon ?? item.icon;
                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onNavigate={onNavigate}
                      tabIndex={isExpanded && isSubExpanded ? 0 : -1}
                      aria-current={isChildCurrent ? (pathname === child.href ? "page" : "location") : undefined}
                      aria-hidden={!isExpanded || !isSubExpanded}
                      className={cn(
                        "group/subnav flex min-h-11 items-center gap-2.5 rounded-control px-2.5 py-1.5 outline-none transition-colors duration-200 ease-interface focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none text-xs",
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
        onNavigate={onNavigate}
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
      </Link>
    );
  }

  return (
    <nav aria-label="ناوبری اصلی" className="space-y-4 text-xs">
      {navigationGroups.map((group, groupIndex) => {
        if (group.label && !company) return null;

        const label = group.label;
        if (!label) {
          return (
            <div key={`nav-group-${groupIndex}`} className="space-y-1">
              {group.items.map((item) => renderItem(item, true))}
            </div>
          );
        }

        const isExpanded = sidebarNav.isGroupExpanded(label);
        const isGroupActive = sidebarNav.isGroupActive(group);
        const groupId = `${idPrefix}-group-${groupIndex}`;

        return (
          <div key={label} className="space-y-1">
            <Button
              variant="ghost"
              onClick={() => sidebarNav.toggleGroup(label)}
              aria-expanded={isExpanded}
              aria-controls={groupId}
              aria-label={`${label} - ${isExpanded ? "بستن دسته‌بندی" : "باز کردن دسته‌بندی"}`}
              className={cn(
                "group/cat h-auto min-h-11 w-full lg:min-h-8 justify-between gap-2 px-3 py-1.5 text-[11px] font-medium outline-none focus-visible:ring-offset-0",
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
              aria-hidden={!isExpanded}
              inert={!isExpanded}
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-200 ease-interface motion-reduce:transition-none",
                isExpanded
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0 pointer-events-none",
              )}
            >
              <div className="overflow-hidden min-h-0">
                <div className="space-y-1 pt-0.5">
                  {group.items.map((item) => renderItem(item, isExpanded))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

