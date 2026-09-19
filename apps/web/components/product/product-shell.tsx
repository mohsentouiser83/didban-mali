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
} from "lucide-react";

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

  const navigationGroups: NavGroup[] = [
    {
      id: "financial-core",
      label: "پیشخوان و خزانه‌داری",
      items: [
        { href: `${base}/overview`, label: "داشبورد مالی", icon: LayoutDashboard },
        { href: `${base}/cashflow`, label: "جریان و تاب‌آوری نقد", icon: WalletCards },
        { href: `${base}/receivables`, label: "هوشمندی مطالبات", icon: ArrowDownLeft },
        { href: `${base}/payables`, label: "هوشمندی پرداختنی‌ها", icon: ArrowUpRight },
        { href: `${base}/reconciliation`, label: "تطبیق حساب‌ها", icon: ArrowLeftRight },
      ],
    },
    {
      id: "data-modeling",
      label: "داده‌ها و محاسبات",
      items: [
        { href: `${base}/imports`, label: "ورود داده‌های مالی", icon: FileUp },
        { href: `${base}/financial-model`, label: "مدل مالی و طبقه‌بندی", icon: Layers },
        { href: `${base}/analysis`, label: "تحلیل مالی دوره‌ای", icon: BarChart3 },
        { href: `${base}/reports`, label: "گزارش‌های مدیریتی", icon: FileText },
      ],
    },
    {
      id: "intelligence",
      label: "هوشمندی و تصمیم‌گیری",
      items: [
        {
          href: `${base}/alerts`,
          label: "هشدارهای زودهنگام",
          icon: BellRing,
          badge: alertSummary?.total_active,
          badgeVariant: alertSummary?.critical_count && alertSummary.critical_count > 0 ? "critical" : "warning",
        },
        { href: `${base}/findings`, label: "یافته‌ها و شواهد", icon: ScanSearch },
        { href: `${base}/simulation`, label: "شبیه‌ساز تصمیمات", icon: SlidersHorizontal },
        { href: `${base}/assistant`, label: "دستیار کنترل‌شده", icon: Bot },
      ],
    },
    {
      id: "governance",
      label: "مدیریت و حاکمیت",
      items: [
        { href: `${base}/readiness`, label: "آمادگی و پذیرش", icon: ShieldCheck },
        { href: `${base}/settings/profile`, label: "پروفایل شرکت", icon: Building2 },
        { href: `${base}/settings/members`, label: "اعضا و دسترسی‌ها", icon: Users2 },
      ],
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
        <SidebarHeader className="border-b border-border/70 p-3 space-y-2.5">
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

          <div className="company-box group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:border-0 flex items-center gap-2 p-1.5 rounded-xl border border-border/80 bg-muted/40 transition-colors">
            <div
              className="size-7 rounded-lg bg-primary text-primary-foreground font-extrabold text-xs grid place-items-center shrink-0 shadow-2xs"
              title={company.legal_name}
            >
              {company.legal_name.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <label htmlFor="sidebar-company-select" className="sr-only">شرکت فعال</label>
              <SelectField
                id="sidebar-company-select"
                value={company.id}
                onChange={(event) => switchCompany(event.target.value)}
                className="h-7 w-full border-0 bg-transparent p-0 text-xs font-bold text-foreground focus:ring-0 cursor-pointer"
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
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground rounded-lg group-data-[collapsible=icon]:hidden"
              title="افزودن شرکت جدید"
            >
              <Link href="/companies/new" aria-label="افزودن شرکت جدید">
                <Plus className="size-3.5" />
              </Link>
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent className="p-2 space-y-1">
          {navigationGroups.map((group) => (
            <SidebarGroup key={group.id} className="py-1 px-1">
              <SidebarGroupLabel className="text-[10px] font-extrabold tracking-wider text-muted-foreground/75 px-2.5 mb-1 select-none">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu aria-label={group.label} className="space-y-0.5">
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
                            "group/item relative flex h-9 w-full items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs sm:text-sm transition-all duration-200",
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
            <div key={pathname} className="route-heading space-y-0.5 min-w-0">
              <span className="breadcrumb block text-xs text-muted-foreground font-medium truncate">{meta.breadcrumb}</span>
              <h1 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight truncate">{meta.title}</h1>
            </div>
          </div>

          <div className="topbar-actions flex items-center gap-2.5 shrink-0">
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
            <div className="company-badge hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-border/70 bg-card/70 text-xs font-bold text-foreground">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="truncate max-w-[160px]">{company.legal_name}</span>
            </div>
          </div>
        </header>

        <div key={pathname} className="content page-stack route-content w-full max-w-7xl mx-auto p-4 sm:p-8 space-y-6 animate-[route-content-in_260ms_ease-out]">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
