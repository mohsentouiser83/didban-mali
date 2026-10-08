"use client";


import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ProductSidebar, type ProductNavGroup } from "./product-sidebar";
import { ProductHeader } from "./product-header";
import { ProductPageFrame } from "./product-page-frame";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, WalletCards, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, FileUp, Layers, BarChart3, FileText, Database, ScanSearch, SlidersHorizontal, Building2, Users2, Plus, ClipboardCheck, LifeBuoy, Sparkles, HardDrive, Zap, Activity, Compass } from "@/components/ui/icons";

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

import type { ControlOverview, InAppAlert } from "@/lib/product-types";

import { useWorkspace } from "./workspace-provider";
import { SupportModal } from "./support-modal";
import { ProductTour } from "./product-tour";

export function ProductShell({ children }: { children: React.ReactNode }) {
  const { companies, company, user } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const base = `/companies/${company.id}`;
  const [alertSummary, setAlertSummary] = useState<{ total_active: number; critical_count: number } | null>(null);
  const [controlOverview, setControlOverview] = useState<ControlOverview | null>(null);
  const [myActionsCount, setMyActionsCount] = useState<number>(0);
  const [inAppAlerts, setInAppAlerts] = useState<InAppAlert[]>([]);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);


  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const tourSeen = localStorage.getItem("didban_user_tour_completed");
      if (!tourSeen) {
        const timer = setTimeout(() => {
          setTourOpen(true);
        }, 700);
        return () => clearTimeout(timer);
      }
    } catch {
      /* silent */
    }
  }, []);

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
    api<{ total_active: number; critical_count: number }>(`/companies/${company.id}/alerts/summary`)
      .then((res) => { if (!ignore) setAlertSummary(res); })
      .catch(() => { /* silent */ });

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

    api<{ items: InAppAlert[]; unread_count: number }>(`/companies/${company.id}/in-app-alerts`)
      .then((res) => {
        if (!ignore) {
          setInAppAlerts(res.items);
          setUnreadAlertsCount(res.unread_count);
        }
      })
      .catch(() => { /* silent */ });

    return () => { ignore = true; };
  }, [company.id, pathname]);

  const markAllAlertsRead = async () => {
    await api(`/companies/${company.id}/in-app-alerts/read-all`, { method: "POST" });
    setUnreadAlertsCount(0);
    setInAppAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
  };

  const navGroups: ProductNavGroup[] = [
    {
      items: [
        { href: `${base}/overview`, label: "داشبورد", icon: LayoutDashboard },
      ],
    },
    {
      label: "مالی",
      items: [
        { href: `${base}/cashflow`, label: "نقدینگی", icon: WalletCards },
        { href: `${base}/receivables`, label: "مطالبات", icon: ArrowDownLeft },
        { href: `${base}/payables`, label: "بدهی‌ها", icon: ArrowUpRight },
        { href: `${base}/scenarios`, label: "سناریوها", icon: Sparkles },
      ],
    },
    {
      label: "کنترل مالی",
      items: [
        {
          href: `${base}/actions`,
          label: "نیازمند اقدام",
          icon: ClipboardCheck,
          badge: myActionsCount > 0 ? myActionsCount : null,
          badgeVariant: "warning",
        },
        {
          href: `${base}/findings`,
          label: "یافته‌ها و هشدارها",
          icon: ScanSearch,
          badge: controlOverview?.critical_count && controlOverview.critical_count > 0 ? controlOverview.critical_count : null,
          badgeVariant: "critical",
        },
        { href: `${base}/reconciliation`, label: "تطبیق", icon: ArrowLeftRight },
      ],
    },
    {
      label: "گزارش و داده",
      items: [
        { href: `${base}/reports`, label: "گزارش‌ها و تحلیل", icon: FileText },
        { href: `${base}/data`, label: "داده‌ها و اتصال‌ها", icon: Database },
      ],
    },
  ];


  const gearMenuItems = [
    {
      href: `${base}/data/connections`,
      title: "اتصال به سیستم‌های مالی و بانکی",
      description: "مدیریت اتصال خودکار به سپیدار و دریافت مستقیم گردش حساب بانکی",
      icon: HardDrive,
    },
    {
      href: `${base}/settings/financial-controls/policies`,
      title: "تنظیمات کنترل مالی",
      description: "خط‌مشی‌های پایش، آستانه‌ها و چرخه‌های خودکار مالی",
      icon: SlidersHorizontal,
    },
    {
      href: `${base}/data`,
      title: "مرکز داده‌های مالی",
      description: "بارگذاری فایل‌های اکسل و CSV، تطبیق ستون‌ها، کیفیت و الگوهای نگاشت",
      icon: FileUp,
    },
    {
      href: `${base}/settings/profile`,
      title: "مشخصات و تنظیمات شرکت",
      description: "شناسه ملی، اطلاعات پایه و پیکربندی حقوقی شرکت",
      icon: Building2,
    },
    {
      href: `${base}/settings/members`,
      title: "اعضا و سطوح دسترسی",
      description: "مدیریت کاربران، حسابداران و تعیین سطوح دسترسی مالی",
      icon: Users2,
    },
    {
      href: "/admin/holding",
      title: "دیدبان هلدینگ (نمای تجمیعی)",
      description: "پایش یکپارچه نقدینگی، مطالبات و کنترل مالی کلیه شرکت‌های هلدینگ",
      icon: Layers,
    },
    {
      href: `${base}/settings/system-health`,
      title: "سلامت سامانه و تشخیص مشکلات",
      description: "وضعیت سرویس‌ها و جزئیات آمادگی سامانه",
      icon: Activity,
    },
    {
      href: "/admin/product-health",
      title: "داشبورد سلامت و حاکمیت محصول",
      description: "رصد ستاره قطبی، وضعیت کوهورت و پایش دروازه‌های ده‌گانه فاز ۸",
      icon: Activity,
    },
    {
      href: "/companies/new",
      title: "ایجاد شرکت جدید",
      description: "تعریف شخصیت حقوقی یا شعبه جدید در فضای کاری",
      icon: Plus,
    },
    {
      href: "#tour",
      title: "تور آشنایی با دیدبان مالی",
      description: "مرور تعاملی ۶ مرحله‌ای بخش‌های کلیدی سامانه برای کاربران جدید",
      icon: Compass,
      onClick: () => {
        setTourOpen(true);
      },
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

  const isItemActive = (href: string) => {
    const target = href.split("?")[0];
    if (target === `${base}/data`) {
      return pathname.startsWith(`${base}/data`) || pathname.startsWith(`${base}/imports`);
    }
    if (target === `${base}/settings/profile`) {
      return pathname.startsWith(`${base}/settings`);
    }
    return pathname === target || pathname.startsWith(`${target}/`);
  };

  return (
    <SidebarProvider style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "4.5rem" } as React.CSSProperties} className="ds-root app-shell product-shell min-h-screen bg-background text-foreground" dir="rtl">
      <a className="product-skip-link" href="#workspace-content">پرش به محتوای صفحه</a>
      <ProductSidebar
        groups={navGroups}
        companyName={company.legal_name}
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
          base={base}
          pathname={pathname}
          settingsItems={gearMenuItems}
          alerts={inAppAlerts}
          unreadCount={unreadAlertsCount}
          activeAlertCount={alertSummary?.total_active ?? 0}
          onSwitchCompany={switchCompany}
          onSearch={() => setCommandOpen(true)}
          onTour={() => setTourOpen(true)}
          onSupport={() => setSupportModalOpen(true)}
          onMarkAllRead={markAllAlertsRead}
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
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/settings/financial-controls/policies`); }}>
                <SlidersHorizontal className="size-4 me-2 text-primary" />
                <span>خط‌مشی‌ها و قوانین پایش</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/data`); }}>
                <Database className="size-4 me-2 text-primary" />
                <span>مرکز داده‌ها و بارگذاری فایل‌ها</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/data/connections`); }}>
                <HardDrive className="size-4 me-2 text-primary" />
                <span>اتصال به نرم‌افزارها و بانک‌ها</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/settings/financial-controls/automations`); }}>
                <Zap className="size-4 me-2 text-primary" />
                <span>اتوماسیون‌ها و چرخه‌های خودکار</span>
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
              <CommandItem onSelect={() => { setCommandOpen(false); router.push("/admin/holding"); }}>
                <Layers className="size-4 me-2 text-primary" />
                <span>دیدبان هلدینگ (نمای تجمیعی)</span>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="پشتیبانی و تنظیمات">
              <CommandItem onSelect={() => { setCommandOpen(false); setTourOpen(true); }}>
                <Compass className="size-4 me-2 text-primary" />
                <span>تور آشنایی با دیدبان مالی</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); setSupportModalOpen(true); }}>
                <LifeBuoy className="size-4 me-2 text-primary" />
                <span>ثبت تیکت و پشتیبانی</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/settings/profile`); }}>
                <Building2 className="size-4 me-2 text-primary" />
                <span>مشخصات و تنظیمات شرکت</span>
              </CommandItem>
              <CommandItem onSelect={() => { setCommandOpen(false); router.push(`${base}/settings/members`); }}>
                <Users2 className="size-4 me-2 text-primary" />
                <span>اعضا و سطوح دسترسی مالی</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        <ProductPageFrame>
          {children}
        </ProductPageFrame>

        <SupportModal
          companyId={company.id}
          open={supportModalOpen}
          onOpenChange={setSupportModalOpen}
          onStartTour={() => setTourOpen(true)}
        />

        <ProductTour
          companyId={company.id}
          open={tourOpen}
          onOpenChange={setTourOpen}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
