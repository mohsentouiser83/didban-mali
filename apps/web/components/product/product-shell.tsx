"use client";


import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ProductSidebar } from "./product-sidebar";
import { productNavigation, isProductItemActive, productSectionNavigation } from "./product-navigation";
import { WorkspaceSectionNav } from "./workspace-section-nav";
import { ProductHeader } from "./product-header";
import { ProductPageFrame } from "./product-page-frame";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, WalletCards, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, BarChart3, FileText, ScanSearch, Building2, Users2, Plus, ClipboardCheck, LifeBuoy, Sparkles, HardDrive, Compass } from "@/components/ui/icons";

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { api } from "@/lib/product-api";

import type { ControlOverview } from "@/lib/product-types";

import { useWorkspace } from "./workspace-provider";
import { SupportModal } from "./support-modal";

export function ProductShell({ children }: { children: React.ReactNode }) {
  const { companies, company, user } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const base = `/companies/${company.id}`;
  const [controlOverview, setControlOverview] = useState<ControlOverview | null>(null);
  const [myActionsCount, setMyActionsCount] = useState<number>(0);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);


  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    let ignore = false;
    api<ControlOverview>(`/companies/${company.id}/control/overview`)
      .then((res) => { if (!ignore) setControlOverview(res); })
      .catch(() => { /* silent */ });

    api<{ assigned_findings: unknown[]; verification_queue: unknown[] }>(`/companies/${company.id}/actions/my-queue`)
      .then((res) => {
        if (!ignore) {
          const count = (res.assigned_findings?.length ?? 0) + (res.verification_queue?.length ?? 0);
          setMyActionsCount(count);
        }
      })
      .catch(() => { /* silent */ });

    return () => { ignore = true; };
  }, [company.id, pathname]);

  const navigation = productNavigation(base, myActionsCount, controlOverview?.critical_count ?? 0);
  const sectionNavigation = productSectionNavigation(pathname, base);

  const gearMenuItems = [
    {
      href: `${base}/data/connections`,
      title: "اتصال به سیستم‌های مالی و بانکی",
      description: "مدیریت اتصال خودکار به سپیدار و دریافت مستقیم گردش حساب بانکی",
      icon: HardDrive,
    },
    {
      href: `${base}/settings/members`,
      title: "اعضا و سطوح دسترسی",
      description: "مدیریت کاربران، حسابداران و تعیین سطوح دسترسی مالی",
      icon: Users2,
    },
    {
      href: "/companies/new",
      title: "ایجاد شرکت جدید",
      description: "تعریف شخصیت حقوقی یا شعبه جدید در فضای کاری",
      icon: Plus,
    },
  ];

  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); }
    finally { router.replace("/login"); router.refresh(); }
  }

  function switchCompany(companyId: string) {
    const suffix = pathname.includes("/findings/") ? "/findings" : pathname.slice(base.length) || "/overview";
    router.push(`/companies/${companyId}${suffix}${window.location.search}`);
  }

  const isItemActive = (href: string) => isProductItemActive(pathname, href, base);

  return (
    <SidebarProvider style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "4.5rem" } as React.CSSProperties} className="ds-root app-shell product-shell min-h-screen bg-background text-foreground" dir="rtl">
      <a className="product-skip-link" href="#workspace-content">پرش به محتوای صفحه</a>
      <ProductSidebar
        groups={navigation.primary}
        secondaryGroups={navigation.secondary}
        userName={user.full_name}
        base={base}
        isItemActive={isItemActive}
        onLogout={logout}
        onSupport={() => setSupportModalOpen(true)}
      />

      <SidebarInset className="workspace product-workspace flex-1 flex flex-col min-w-0">
        <ProductHeader
          company={company}
          companies={companies}
          pathname={pathname}
          settingsItems={gearMenuItems}
          onSwitchCompany={switchCompany}
          onSearch={() => setCommandOpen(true)}
          onSupport={() => setSupportModalOpen(true)}
        />

        {/* Global Command Palette Dialog */}
        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="جستجو در بخش‌های مالی، اسناد، شرکت‌ها و ابزارها..." />
          <CommandList className="max-h-[380px]">
            <CommandEmpty>نتیجه‌ای یافت نشد.</CommandEmpty>

            <CommandGroup heading="صفحات و ماژول‌های مالی">
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/overview`); }}>
                <LayoutDashboard className="size-4 me-2 text-primary" />
                <span>داشبورد تحلیلی و مدیریتی</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/cashflow`); }}>
                <WalletCards className="size-4 me-2 text-primary" />
                <span>جریان و وضعیت نقدینگی</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/cashflow?view=forecast`); }}>
                <BarChart3 className="size-4 me-2 text-primary" />
                <span>پیش‌بینی نقدینگی و کسری‌ها</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/receivables`); }}>
                <ArrowDownLeft className="size-4 me-2 text-primary" />
                <span>مدیریت و وصول مطالبات</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/payables`); }}>
                <ArrowUpRight className="size-4 me-2 text-primary" />
                <span>بدهی‌ها و تعهدات سررسیدشده</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/scenarios`); }}>
                <Sparkles className="size-4 me-2 text-primary" />
                <span>شبیه‌ساز سناریوهای مالی</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/reconciliation`); }}>
                <ArrowLeftRight className="size-4 me-2 text-primary" />
                <span>تطبیق هوشمند بانکی و دفاتر</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/findings`); }}>
                <ScanSearch className="size-4 me-2 text-primary" />
                <span>یافته‌ها و مغایرت‌های مالی</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/actions`); }}>
                <ClipboardCheck className="size-4 me-2 text-primary" />
                <span>کارتابل کارهای من</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/data/connections`); }}>
                <HardDrive className="size-4 me-2 text-primary" />
                <span>اتصال به نرم‌افزارها و بانک‌ها</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/reports/analysis`); }}>
                <BarChart3 className="size-4 me-2 text-primary" />
                <span>محاسبه و تحلیل صورت‌های مالی</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/reports`); }}>
                <FileText className="size-4 me-2 text-primary" />
                <span>گزارش‌های جامع مالی</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="جابجایی بین شرکت‌ها">
              {companies.map((c) => (
                <CommandItem
                  key={c.id}
                  onSelect={() => {
                    setCommandOpen(false);
                    switchCompany(c.id);
                  }}
                >
                  <Building2 className="size-4 me-2 text-primary" />
                  <span>{c.legal_name}</span>
                  {c.id === company.id && (
                    <span className="ms-auto text-[11px] font-bold text-primary">فعال</span>
                  )}
                </CommandItem>
              ))}
              <CommandItem onSelect={() => { setCommandOpen(false); router.push("/companies/new"); }}>
                <Plus className="size-4 me-2 text-primary" />
                <span>تعریف شرکت جدید</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="پشتیبانی و تنظیمات">
              <CommandItem onSelect={() => { setCommandOpen(false); setSupportModalOpen(true); }}>
                <LifeBuoy className="size-4 me-2 text-primary" />
                <span>ثبت تیکت و پشتیبانی</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/settings/members`); }}>
                <Users2 className="size-4 me-2 text-primary" />
                <span>اعضا و سطوح دسترسی مالی</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        <ProductPageFrame>
          {sectionNavigation && <WorkspaceSectionNav {...sectionNavigation} />}
          {children}
        </ProductPageFrame>

        <SupportModal
          companyId={company.id}
          open={supportModalOpen}
          onOpenChange={setSupportModalOpen}
        />

      </SidebarInset>
    </SidebarProvider>
  );
}
