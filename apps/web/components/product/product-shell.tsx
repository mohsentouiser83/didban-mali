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
} from "lucide-react";

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ThemeToggle } from "@/components/design-system/theme-toggle";
import { api } from "@/lib/product-api";
import { cn } from "@/lib/utils";

import { Mark } from "./icons";
import { useWorkspace } from "./workspace-provider";

const pageMeta = [
  { match: "/overview", title: "داشبورد مالی", breadcrumb: "فضای کاری / وضعیت مالی" },
  { match: "/imports", title: "ورود داده‌های مالی", breadcrumb: "فضای کاری / ورود داده" },
  { match: "/financial-model", title: "مدل مالی", breadcrumb: "فضای کاری / نرمال‌سازی و طبقه‌بندی" },
  { match: "/analysis", title: "تحلیل مالی", breadcrumb: "فضای کاری / محاسبات دوره‌ای" },
  { match: "/reconciliation", title: "تطبیق حساب‌ها", breadcrumb: "فضای کاری / بانک و حسابداری" },
  { match: "/receivables", title: "هوشمندی مطالبات", breadcrumb: "فضای کاری / جریان نقد و وصول مطالبات" },
  { match: "/payables", title: "هوشمندی پرداختنی‌ها", breadcrumb: "فضای کاری / بستانکاران و تامین‌کنندگان" },
  { match: "/cashflow", title: "جریان و تاب‌آوری نقد", breadcrumb: "فضای کاری / پیش‌بینی نقدینگی و خزانه" },
  { match: "/alerts", title: "هشدارهای زودهنگام", breadcrumb: "فضای کاری / پایش پیش‌دستانه و ریسک" },
  { match: "/simulation", title: "شبیه‌ساز تصمیمات مالی", breadcrumb: "فضای کاری / شبیه‌سازی و سناریوسازی" },
  { match: "/findings", title: "یافته‌ها", breadcrumb: "فضای کاری / اولویت و شواهد" },
  { match: "/reports", title: "گزارش‌های مالی", breadcrumb: "فضای کاری / اسناد مدیریتی" },
  { match: "/assistant", title: "دستیار کنترل‌شده", breadcrumb: "فضای کاری / هوشمندی و حاکمیت" },
  { match: "/readiness", title: "آمادگی و پذیرش", breadcrumb: "فضای کاری / گیت نهایی محصول" },
  { match: "/settings/profile", title: "پروفایل شرکت", breadcrumb: "تنظیمات شرکت / مشخصات پایه" },
  { match: "/settings/members", title: "اعضا و دسترسی‌ها", breadcrumb: "تنظیمات شرکت / اعضا" },
];

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number | null;
  badgeVariant?: "critical" | "warning";
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export function ProductShell({ children }: { children: React.ReactNode }) {
  const { user, companies, company } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const base = `/companies/${company.id}`;
  const [alertSummary, setAlertSummary] = useState<{ total_active: number; critical_count: number } | null>(null);

  useEffect(() => {
    let ignore = false;
    api<{ total_active: number; critical_count: number }>(`/companies/${company.id}/alerts/summary`)
      .then((res) => { if (!ignore) setAlertSummary(res); })
      .catch(() => { /* silent */ });
    return () => { ignore = true; };
  }, [company.id]);

  const meta = pathname.includes("/imports/")
    ? { title: "آماده‌سازی داده", breadcrumb: "ورود داده / نگاشت و اعتبارسنجی" }
    : pathname.includes("/findings/")
    ? { title: "پرونده یافته", breadcrumb: "یافته‌ها / بررسی مشاور و شواهد" }
    : pageMeta.find((item) => pathname.endsWith(item.match)) ?? pageMeta[0];

  const navigationItems: NavItem[] = [
    { href: `${base}/overview`, label: "داشبورد مالی", icon: LayoutDashboard },
    { href: `${base}/cashflow`, label: "جریان و تاب‌آوری نقد", icon: WalletCards },
    { href: `${base}/receivables`, label: "هوشمندی مطالبات", icon: ArrowDownLeft },
    { href: `${base}/payables`, label: "هوشمندی پرداختنی‌ها", icon: ArrowUpRight },
    { href: `${base}/reconciliation`, label: "تطبیق حساب‌ها", icon: ArrowLeftRight },
    { href: `${base}/financial-model`, label: "مدل مالی و طبقه‌بندی", icon: Layers },
    { href: `${base}/analysis`, label: "تحلیل مالی دوره‌ای", icon: BarChart3 },
    { href: `${base}/reports`, label: "گزارش‌های مدیریتی", icon: FileText },
  ];

  const [settingsOpen, setSettingsOpen] = useState(false);

  const gearMenuItems = [
    {
      href: `${base}/findings`,
      title: "یافته‌ها و شواهد مالی",
      description: "پرونده ناهنجاری‌های مالی، کشف ریسک‌ها و زنجیره شواهد",
      icon: ScanSearch,
    },
    {
      href: `${base}/simulation`,
      title: "شبیه‌ساز تصمیمات",
      description: "سناریوسازی و سنجش اثر تصمیمات بر نقدینگی و سود",
      icon: SlidersHorizontal,
    },
    {
      href: `${base}/assistant`,
      title: "دستیار مالی کنترل‌شده",
      description: "پرسش و پاسخ تحلیلی هوشمند با گاردریل‌های حاکمیت داده",
      icon: Bot,
    },
    {
      href: `${base}/imports`,
      title: "ورود داده‌های مالی",
      description: "بارگذاری و پردازش فایل‌های حسابداری، بانک و فاکتورها",
      icon: FileUp,
    },
    {
      href: `${base}/settings/members`,
      title: "اعضا و دسترسی‌ها",
      description: "مدیریت کاربران، حسابداران و تعیین سطوح دسترسی مالی",
      icon: Users2,
    },
    {
      href: `${base}/settings/profile`,
      title: "مشخصات و تنظیمات شرکت",
      description: "شناسه ملی، اطلاعات پایه و پیکربندی حقوقی شرکت",
      icon: Building2,
    },
    {
      href: `${base}/readiness`,
      title: "آمادگی و ارزیابی سامانه",
      description: "کنترل دروازه پذیرش، آزمون‌های کیفی و سلامت عملیاتی",
      icon: ShieldCheck,
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
    if (pathname === href) return true;
    if (["/imports", "/findings"].some((suffix) => href.endsWith(suffix)) && pathname.startsWith(`${href}/`)) {
      return true;
    }
    return false;
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

        <SidebarContent className="px-2.5 py-3 space-y-1">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {navigationItems.map((item) => {
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
            <div key={pathname} className="route-heading space-y-0.5 min-w-0">
              <span className="breadcrumb block text-xs text-muted-foreground font-medium truncate">{meta.breadcrumb}</span>
              <h1 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight truncate">{meta.title}</h1>
            </div>
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

            <Button asChild variant="outline" size="icon" className="relative size-9 rounded-xl border-border" title="هشدارهای زودهنگام">
              <Link href={`${base}/alerts`} aria-label="هشدارهای زودهنگام">
                <BellRing className="size-4" />
                {alertSummary && alertSummary.total_active > 0 && (
                  <span
                    className={`absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${
                      alertSummary.critical_count > 0 ? "bg-red-600 animate-pulse" : "bg-amber-600"
                    }`}
                  >
                    {alertSummary.total_active}
                  </span>
                )}
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </header>

        <div key={pathname} className="content page-stack route-content w-full max-w-7xl mx-auto p-4 sm:p-8 space-y-6 animate-[route-content-in_260ms_ease-out]">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
