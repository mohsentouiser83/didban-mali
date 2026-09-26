"use client";

import { SelectField, SelectOption } from "./select-field";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  WalletCards,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  FileUp,
  Layers,
  BarChart3,
  FileText,
  Database,
  BellRing,
  ScanSearch,
  SlidersHorizontal,
  Bot,
  ShieldCheck,
  Building2,
  Users2,
  LogOut,
  Plus,
  Settings,
  ClipboardCheck,
  CheckCheck,
  LifeBuoy,
  Sparkles,
  HardDrive,
  Zap,
  Activity,
} from "lucide-react";

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ThemeToggle } from "@/components/design-system/theme-toggle";
import { api } from "@/lib/product-api";
import { cn } from "@/lib/utils";
import type { ControlOverview, InAppAlert } from "@/lib/product-types";

import { Mark } from "./icons";
import { useWorkspace } from "./workspace-provider";
import { OnboardingWizardBanner } from "./onboarding-wizard-banner";
import { SupportModal } from "./support-modal";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number | null;
  badgeVariant?: "critical" | "warning";
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

export function ProductShell({ children }: { children: React.ReactNode }) {
  const { user, companies, company } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const base = `/companies/${company.id}`;
  const [alertSummary, setAlertSummary] = useState<{ total_active: number; critical_count: number } | null>(null);
  const [controlOverview, setControlOverview] = useState<ControlOverview | null>(null);
  const [myActionsCount, setMyActionsCount] = useState<number>(0);
  const [inAppAlerts, setInAppAlerts] = useState<InAppAlert[]>([]);
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [alertsPopoverOpen, setAlertsPopoverOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  useEffect(() => {
    let ignore = false;
    api<{ total_active: number; critical_count: number }>(`/companies/${company.id}/alerts/summary`)
      .then((res) => { if (!ignore) setAlertSummary(res); })
      .catch(() => { /* silent */ });

    api<ControlOverview>(`/companies/${company.id}/control/overview`)
      .then((res) => { if (!ignore) setControlOverview(res); })
      .catch(() => { /* silent */ });

    api<{ assigned_findings: any[]; verification_queue: any[] }>(`/companies/${company.id}/actions/my-queue`)
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
    try {
      await api(`/companies/${company.id}/in-app-alerts/read-all`, { method: "POST" });
      setUnreadAlertsCount(0);
      setInAppAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
    } catch {
      /* silent */
    }
  };

  const navGroups: NavGroup[] = [
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
        { href: `${base}/cashflow?view=forecast`, label: "پیش‌بینی نقدینگی", icon: BarChart3 },
        { href: `${base}/scenarios`, label: "شبیه‌سازی سناریو", icon: Sparkles },
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
          label: "یافته‌ها",
          icon: ScanSearch,
          badge: controlOverview?.critical_count && controlOverview.critical_count > 0 ? controlOverview.critical_count : null,
          badgeVariant: "critical",
        },
        { href: `${base}/reconciliation`, label: "تطبیق", icon: ArrowLeftRight },
        { href: `${base}/control/policies`, label: "خط‌مشی‌های پایش", icon: SlidersHorizontal },
      ],
    },
    {
      label: "داده‌ها و اتصال‌ها",
      items: [
        { href: `${base}/reports`, label: "گزارش‌ها", icon: FileText },
        { href: `${base}/data`, label: "داده‌ها", icon: Database },
        { href: `${base}/integrations`, label: "اتصال‌ها", icon: HardDrive },
        { href: `${base}/automations`, label: "اتوماسیون‌ها", icon: Zap },
      ],
    },
  ];

  const [settingsOpen, setSettingsOpen] = useState(false);

  const gearMenuItems = [
    {
      href: `${base}/integrations`,
      title: "اتصال به سیستم‌های مالی و بانکی",
      description: "مدیریت اتصال خودکار به سپیدار و دریافت مستقیم گردش حساب بانکی",
      icon: HardDrive,
    },
    {
      href: `${base}/automations`,
      title: "اتوماسیون‌ها و چرخه‌های خودکار",
      description: "تنظیم چرخه صبحگاهی خزانه‌داری، تطبیق خودکار و تخصیص وظایف",
      icon: Zap,
    },
    {
      href: `${base}/control/policies`,
      title: "قوانین و خط‌مشی‌های کنترل مالی",
      description: "تنظیم آستانه‌ها، سطح حساسیت و فعال‌سازی قواعد ۸ گانه تشخیص مغایرت",
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
  ];

  async function logout() {
    try { await api("/auth/logout", { method: "POST" }); }
    finally { router.replace("/login"); router.refresh(); }
  }

  function switchCompany(companyId: string) {
    const suffix = pathname.includes("/findings/") ? "/findings" : pathname.slice(base.length) || "/overview";
    router.push(`/companies/${companyId}${suffix}`);
  }

  const isItemActive = (href: string) => {
    if (href.includes("?view=forecast")) {
      return (
        pathname.startsWith(`${base}/cashflow`) &&
        typeof window !== "undefined" &&
        window.location.search.includes("view=forecast")
      );
    }
    if (href.endsWith("/cashflow")) {
      return (
        pathname.startsWith(`${base}/cashflow`) &&
        (typeof window === "undefined" || !window.location.search.includes("view=forecast"))
      );
    }
    if (href.endsWith("/overview")) {
      return pathname.startsWith(`${base}/overview`) || pathname.startsWith(`${base}/analysis`);
    }
    if (href.endsWith("/receivables")) {
      return pathname.startsWith(`${base}/receivables`);
    }
    if (href.endsWith("/payables")) {
      return pathname.startsWith(`${base}/payables`);
    }
    if (href.endsWith("/actions")) {
      return pathname.startsWith(`${base}/actions`);
    }
    if (href.endsWith("/findings")) {
      return pathname.startsWith(`${base}/findings`);
    }
    if (href.endsWith("/reconciliation")) {
      return pathname.startsWith(`${base}/reconciliation`);
    }
    if (href.endsWith("/control/policies")) {
      return pathname.startsWith(`${base}/control/policies`);
    }
    if (href.endsWith("/reports")) {
      return pathname.startsWith(`${base}/reports`);
    }
    if (href.endsWith("/data")) {
      return pathname.startsWith(`${base}/data`) || pathname.startsWith(`${base}/imports`);
    }
    return pathname === href;
  };

  return (
    <SidebarProvider className="ds-root app-shell min-h-screen bg-background text-foreground" dir="rtl">
      <Sidebar side="left" collapsible="icon" className="product-sidebar border-inline-end border-border bg-sidebar backdrop-blur-md">
        <SidebarHeader className="border-b border-border/70 p-3.5">
          <div className="flex items-center justify-between px-1">
            <Link
              className="brand flex items-center gap-2.5 font-extrabold text-foreground transition-opacity hover:opacity-90"
              href={`${base}/overview`}
            >
              <div className="size-8 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                <Mark className="size-5" />
              </div>
              <div className="flex flex-col group-data-[collapsible=icon]:hidden">
                <span className="font-extrabold text-sm leading-tight text-foreground">دیدبان مالی</span>
                <span className="text-[10px] text-muted-foreground font-medium">هوشمندی و کنترل مالی</span>
              </div>
            </Link>
          </div>
        </SidebarHeader>

        <SidebarContent className="px-2.5 py-3 space-y-3">
          {navGroups.map((group, groupIdx) => (
            <SidebarGroup key={groupIdx} className="p-0">
              {group.label && (
                <SidebarGroupLabel className="px-2.5 text-[11px] font-bold text-muted-foreground/80 tracking-wider">
                  {group.label}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isItemActive(item.href);
                    const IconComponent = item.icon;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.label}
                          className={cn(
                            "group/item relative flex h-[38px] w-full items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs sm:text-[13px] transition-all duration-200",
                            active
                              ? "!bg-primary/10 !text-primary font-bold shadow-xs border border-primary/20 dark:!bg-primary/15 dark:border-primary/30 before:absolute before:inset-y-1.5 before:start-1 before:w-1 before:rounded-full before:bg-primary"
                              : "text-muted-foreground font-medium hover:!bg-muted/70 hover:!text-foreground hover:-translate-x-0.5"
                          )}
                        >
                          <Link href={item.href} aria-current={active ? "page" : undefined} className="flex items-center gap-2.5 w-full">
                            <div
                              className={cn(
                                "flex size-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200 group-data-[collapsible=icon]:size-auto group-data-[collapsible=icon]:bg-transparent",
                                active
                                  ? "bg-primary text-primary-foreground shadow-2xs"
                                  : "bg-transparent text-muted-foreground group-hover/item:bg-primary/10 group-hover/item:text-primary group-hover/item:scale-105"
                              )}
                            >
                              <IconComponent className="size-4 shrink-0" />
                            </div>
                            <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {item.badge && item.badge > 0 ? (
                          <SidebarMenuBadge
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-bold ms-auto",
                              item.badgeVariant === "critical"
                                ? "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 animate-pulse"
                                : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                            )}
                          >
                            {item.badge}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="border-t border-border/60 p-3">
          <div className="user-box group-data-[collapsible=icon]:p-1 group-data-[collapsible=icon]:justify-center flex items-center justify-between gap-2.5 p-2 rounded-xl border border-border/70 bg-muted/30">
            <Avatar className="avatar size-8 shrink-0 border border-border/60">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                {user.full_name.slice(0, 1)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <strong className="block truncate text-xs font-bold text-foreground">{user.full_name}</strong>
              <small dir="ltr" className="block truncate text-[11px] text-muted-foreground text-start">
                {user.email}
              </small>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg shrink-0 cursor-pointer group-data-[collapsible=icon]:hidden transition-colors"
              onClick={() => void logout()}
              title="خروج از حساب کاربری"
            >
              <LogOut className="size-4" />
              <span className="sr-only">خروج از حساب کاربری</span>
            </Button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="workspace flex-1 flex flex-col min-w-0">
        <header className="topbar sticky top-0 z-20 flex min-h-[68px] items-center justify-between gap-4 border-b border-border bg-background/85 px-4 sm:px-8 backdrop-blur-xl">
          <div className="topbar-leading flex items-center gap-3 min-w-0">
            <SidebarTrigger aria-label="باز و بسته‌کردن منو" className="size-9 rounded-xl border border-border/80" />
          </div>

          <div className="topbar-actions flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Company Switcher in Header */}
            <div className="company-switcher flex items-center gap-1.5 p-1 rounded-xl border border-border/80 bg-card/80 backdrop-blur-sm shadow-2xs hover:border-primary/40 transition-colors">
              <div
                className="size-7 rounded-lg bg-primary text-primary-foreground font-extrabold text-xs grid place-items-center shrink-0 shadow-2xs"
                title={company.legal_name}
              >
                {company.legal_name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <label htmlFor="header-company-select" className="sr-only">انتخاب شرکت</label>
                <SelectField
                  id="header-company-select"
                  value={company.id}
                  onChange={(event) => switchCompany(event.target.value)}
                  className="h-7 border-0 bg-transparent py-0 pe-6 ps-1 text-xs font-bold text-foreground focus:ring-0 cursor-pointer max-w-[140px] sm:max-w-[200px] truncate"
                >
                  {companies.map((item) => (
                    <SelectOption key={item.id} value={item.id}>
                      {item.legal_name}
                    </SelectOption>
                  ))}
                </SelectField>
              </div>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-7 shrink-0 text-muted-foreground hover:text-foreground rounded-lg hidden md:flex"
                title="افزودن شرکت جدید"
              >
                <Link href="/companies/new" aria-label="افزودن شرکت جدید">
                  <Plus className="size-3.5" />
                </Link>
              </Button>
            </div>

            {/* Gear Menu Settings Popover */}
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={`size-9 rounded-xl border-border transition-colors ${
                    settingsOpen ? "bg-accent text-primary border-primary/40" : ""
                  }`}
                  title="تنظیمات و مدیریت سامانه"
                  aria-label="تنظیمات و مدیریت سامانه"
                >
                  <Settings className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="w-[94vw] sm:w-[580px] md:w-[620px] p-3 rounded-2xl border-border bg-popover shadow-2xl"
                dir="rtl"
              >
                <div className="px-2 py-2 border-b border-border/60 mb-2.5 flex items-center justify-between">
                  <div>
                    <span className="block text-xs font-bold text-foreground">تنظیمات و مدیریت سامانه</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">پیکربندی اسناد، اطلاعات شرکت، دسترسی‌ها و سلامت سیستم</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-md">
                    {company.legal_name}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {gearMenuItems.map((item) => {
                    const IconComp = item.icon;
                    const isActive = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setSettingsOpen(false)}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all ${
                          isActive
                            ? "bg-primary/10 text-primary border-primary/30"
                            : "border-border/60 bg-card/50 hover:bg-card hover:border-primary/30 text-foreground"
                        }`}
                      >
                        <div
                          className={`size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <IconComp className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <strong className="block text-xs font-bold leading-tight">{item.title}</strong>
                          <p className="text-[11px] text-muted-foreground leading-normal mt-0.5 font-normal line-clamp-2">
                            {item.description}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {/* My Action Queue Shortcut */}
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl border-border text-xs font-bold hover:border-primary/40 transition-colors" title="کارتابل وظایف و اقدامات من">
              <Link href={`${base}/actions`} aria-label="کارتابل وظایف و اقدامات من">
                <ClipboardCheck className="size-4 text-primary" />
                <span className="hidden md:inline">کارهای من</span>
              </Link>
            </Button>

            {/* In-App Alerts & Early Warnings Popover */}
            <Popover open={alertsPopoverOpen} onOpenChange={setAlertsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className={`relative size-9 rounded-xl border-border transition-colors ${
                    alertsPopoverOpen ? "bg-accent text-primary border-primary/40" : ""
                  }`}
                  title="اعلان‌ها و هشدارهای مالی"
                  aria-label="اعلان‌ها و هشدارهای مالی"
                >
                  <BellRing className="size-4" />
                  {unreadAlertsCount > 0 ? (
                    <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white bg-red-600 animate-pulse">
                      {unreadAlertsCount}
                    </span>
                  ) : alertSummary && alertSummary.total_active > 0 ? (
                    <span className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white bg-amber-600">
                      {alertSummary.total_active}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="w-[94vw] sm:w-[420px] p-0 rounded-2xl border-border bg-popover shadow-2xl overflow-hidden"
                dir="rtl"
              >
                <div className="p-3 border-b border-border/70 flex items-center justify-between bg-muted/40">
                  <div className="flex items-center gap-2">
                    <BellRing className="size-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">اعلان‌ها و هشدارهای مالی</span>
                  </div>
                  {unreadAlertsCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void markAllAlertsRead()}
                      className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <CheckCheck className="size-3.5" />
                      <span>خواندن همه</span>
                    </Button>
                  )}
                </div>

                <div className="max-h-[360px] overflow-y-auto divide-y divide-border/60">
                  {inAppAlerts.length > 0 ? (
                    inAppAlerts.map((alert) => {
                      const targetHref = alert.finding_id
                        ? `${base}/findings/${alert.finding_id}`
                        : `${base}/control`;
                      return (
                        <Link
                          key={alert.id}
                          href={targetHref}
                          onClick={() => setAlertsPopoverOpen(false)}
                          className={`flex items-start gap-3 p-3 transition-colors hover:bg-muted/50 ${
                            !alert.is_read ? "bg-primary/5" : ""
                          }`}
                        >
                          <div className="mt-1 size-2 rounded-full shrink-0 bg-primary" style={{ opacity: alert.is_read ? 0.2 : 1 }} />
                          <div className="flex-1 min-w-0">
                            <strong className="block text-xs font-bold text-foreground truncate">{alert.title_fa}</strong>
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                              {alert.body_fa || alert.message_fa}
                            </p>
                            <span className="block text-[10px] text-muted-foreground/80 mt-1 font-mono">
                              {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(alert.created_at))}
                            </span>
                          </div>
                        </Link>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                      هیچ اعلان خوانده‌نشده‌ای وجود ندارد.
                    </div>
                  )}
                </div>

                <div className="p-2 border-t border-border/70 bg-muted/20 flex items-center justify-between text-xs">
                  <Link
                    href={`${base}/alerts`}
                    onClick={() => setAlertsPopoverOpen(false)}
                    className="text-primary hover:underline font-bold text-[11px] px-2 py-1"
                  >
                    مشاهده هشدارهای زودهنگام سیستم ←
                  </Link>
                  <Link
                    href={`${base}/actions`}
                    onClick={() => setAlertsPopoverOpen(false)}
                    className="text-muted-foreground hover:text-foreground font-medium text-[11px] px-2 py-1"
                  >
                    کارتابل کارهای من
                  </Link>
                </div>
              </PopoverContent>
            </Popover>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSupportModalOpen(true)}
              className="size-8 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
              title="پشتیبانی و ثبت تیکت"
            >
              <LifeBuoy className="size-4" />
            </Button>

            <ThemeToggle />
          </div>
        </header>

        <div key={pathname} className="content page-stack route-content w-full max-w-7xl mx-auto p-4 sm:p-8 space-y-6 animate-[route-content-in_260ms_ease-out]">
          <OnboardingWizardBanner companyId={company.id} />
          {children}
        </div>

        <SupportModal
          companyId={company.id}
          open={supportModalOpen}
          onOpenChange={setSupportModalOpen}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
