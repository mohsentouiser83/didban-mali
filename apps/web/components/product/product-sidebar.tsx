"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  LifeBuoy,
  LogOut,
  X,
  type AppIcon,
} from "@/components/ui/icons";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { Mark } from "./icons";
import { Button } from "@/components/ui/button";

export type ProductNavGroup = {
  label?: string;
  items: {
    href: string;
    label: string;
    icon: AppIcon;
    badge?: number | null;
    badgeVariant?: "critical" | "warning";
  }[];
};

type ProductSidebarProps = {
  groups: ProductNavGroup[];
  secondaryGroups?: ProductNavGroup[];
  userName: string;
  base: string;
  isItemActive: (href: string) => boolean;
  onLogout: () => Promise<void>;
  onSupport: () => void;
};

export function ProductSidebar({
  groups,
  secondaryGroups = [],
  userName,
  base,
  isItemActive,
  onLogout,
  onSupport,
}: ProductSidebarProps) {
  const { isMobile, openMobile, setOpenMobile, state, toggleSidebar } =
    useSidebar();
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  const collapsed = state === "collapsed" && !isMobile;

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const activeHref =
    [...groups, ...secondaryGroups]
      .flatMap((group) => group.items)
      .find((item) => isItemActive(item.href))?.href ??
    null;
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const measure = () => {
      const active = surface.querySelector<HTMLElement>(
        '.sidebar-nav-item[aria-current="page"]',
      );
      if (!active) {
        setSelection(null);
        return;
      }
      const box = active.getBoundingClientRect();
      const parent = surface.getBoundingClientRect();
      const scrollArea = active.closest('[data-sidebar="content"]');
      const viewport = scrollArea?.getBoundingClientRect();
      if (
        !box.width ||
        (viewport && (box.top < viewport.top || box.bottom > viewport.bottom))
      ) {
        setSelection(null);
        return;
      }
      const next = {
        x: box.left - parent.left,
        y: box.top - parent.top,
        width: box.width,
        height: box.height,
      };
      setSelection((previous) =>
        previous &&
        Object.keys(next).every(
          (key) =>
            previous[key as keyof typeof next] ===
            next[key as keyof typeof next],
        )
          ? previous
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    surface.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      surface.removeEventListener("scroll", measure, true);
    };
  }, [activeHref, collapsed, isMobile, openMobile]);

  const renderItems = (items: ProductNavGroup[]) => (
    <SidebarMenu className="gap-1">
      {items.flatMap((group) => group.items).map((item) => {
        const active = isItemActive(item.href);
        const Icon = item.icon;
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={{ children: item.label, side: "left" }}
              className="sidebar-nav-item h-11 md:h-9 gap-2.5 rounded-[10px] px-3 text-[13px] font-medium group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!p-3"
            >
              <Link
                href={item.href}
                onClick={closeMobile}
                aria-label={
                  item.badge
                    ? `${item.label}، ${item.badge.toLocaleString("fa-IR")} مورد`
                    : item.label
                }
                aria-current={active ? "page" : undefined}
              >
                <Icon className="!size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">
                  {item.label}
                </span>
                {!!item.badge && item.badge > 0 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "sidebar-count ms-auto inline-flex min-w-6 items-center justify-center rounded-md px-1.5 py-0.5 text-xs tabular-nums group-data-[collapsible=icon]:hidden",
                      item.badgeVariant === "critical"
                        ? "sidebar-count-critical"
                        : "sidebar-count-warning",
                    )}
                  >
                    {item.badge.toLocaleString("fa-IR")}
                  </span>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  return (
    <Sidebar side="left" collapsible="icon" className="product-sidebar">
      <div ref={surfaceRef} className="product-sidebar-surface">
        <span
          aria-hidden="true"
          className="sidebar-selection"
          style={
            selection
              ? {
                  transform: `translate3d(${selection.x}px, ${selection.y}px, 0)`,
                  width: selection.width,
                  height: selection.height,
                }
              : { display: "none" }
          }
        />
        <SidebarHeader className="gap-5 px-4 pb-4 pt-5 group-data-[collapsible=icon]:px-3">
          <div className="flex min-h-11 items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
            <Link
              href={`${base}/overview`}
              onClick={closeMobile}
              aria-label="دیدبان مالی — داشبورد"
              className="sidebar-brand flex min-w-0 items-center gap-2 rounded-lg"
            >
              <span className="sidebar-brand-mark grid size-6 shrink-0 place-items-center">
                <Mark className="size-6 border-0 shadow-none" />
              </span>
              <span className="min-w-0 group-data-[collapsible=icon]:hidden">
                <strong className="block text-base font-bold leading-relaxed">
                  دیدبان مالی
                </strong>
              </span>
            </Link>
            <Button
              variant="surface"
              size="auto"
              motion="none"
              type="button"
              onClick={toggleSidebar}
              aria-label={
                isMobile
                  ? "بستن منو"
                  : collapsed
                    ? "بازکردن سایدبار"
                    : "جمع‌کردن سایدبار"
              }
              aria-expanded={isMobile ? true : !collapsed}
              className="sidebar-icon-button grid size-7 shrink-0 place-items-center rounded-lg"
            >
              {isMobile ? (
                <X className="size-4" />
              ) : collapsed ? (
                <ChevronsLeft className="size-4" />
              ) : (
                <ChevronsRight className="size-4" />
              )}
            </Button>
          </div>

        </SidebarHeader>

        <SidebarContent className="px-3 pb-4 pt-1">
          <nav aria-label="ناوبری اصلی" className="shrink-0">
            {renderItems([...groups, ...secondaryGroups])}
          </nav>
        </SidebarContent>

        <SidebarFooter className="sidebar-footer gap-2 px-3 pb-4 pt-3">
          {!collapsed && (
            <div className="sidebar-company-copy px-3 pb-2">
              <strong>{userName}</strong>
              <small>حساب کاربری</small>
            </div>
          )}
          <SidebarMenu className="gap-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  closeMobile();
                  onSupport();
                }}
                aria-label="راهنما و پشتیبانی"
                tooltip={{ children: "راهنما و پشتیبانی", side: "left" }}
                className="sidebar-nav-item h-11 md:h-9 gap-2.5 rounded-[10px] px-3 text-[13px] group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!p-3"
              >
                <LifeBuoy className="!size-4" />
                <span className="group-data-[collapsible=icon]:hidden">
                  راهنما و پشتیبانی
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => {
                  closeMobile();
                  void onLogout();
                }}
                aria-label="خروج از حساب کاربری"
                tooltip={{ children: "خروج از حساب کاربری", side: "left" }}
                className="sidebar-nav-item h-11 md:h-9 gap-2.5 rounded-[10px] px-3 text-[13px] group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!p-3"
              >
                <LogOut className="!size-4" />
                <span className="group-data-[collapsible=icon]:hidden">
                  خروج از حساب
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}
