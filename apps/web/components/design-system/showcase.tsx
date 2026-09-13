"use client";

import { Activity, BadgeCheck, BarChart3, Bell, Blocks, Bot, Building2, ChevronsLeft, ChevronsRight, Command, FileCheck2, Gauge, LayoutDashboard, Menu, Search, Settings2, ShieldCheck, Sparkles, Table2, TriangleAlert, WalletCards } from "lucide-react";
import { useState } from "react";
import { toast, Toaster } from "sonner";

import { CashflowChart } from "@/components/design-system/cashflow-chart";
import { ReconciliationTable } from "@/components/design-system/reconciliation-table";
import { ThemeToggle } from "@/components/design-system/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const navigation = [
  { label: "نمای کلی", icon: LayoutDashboard, active: true },
  { label: "کنترل عملیات", icon: Gauge },
  { label: "تطبیق بانکی", icon: FileCheck2 },
  { label: "تحلیل نقدینگی", icon: BarChart3 },
  { label: "یافته‌ها", icon: TriangleAlert, count: "۳" },
];

const metrics = [
  { title: "مانده نقد قابل اتکا", value: "۱۲٫۸", unit: "میلیارد ریال", delta: "۸٫۴٪+", icon: WalletCards, variant: "success" as const },
  { title: "اسناد کنترل‌شده", value: "۹۸٫۲٪", unit: "از ۲٬۴۸۰ سند", delta: "۱٫۲٪+", icon: BadgeCheck, variant: "default" as const },
  { title: "موارد نیازمند اقدام", value: "۷", unit: "۳ مورد با اولویت بالا", delta: "۲−", icon: Activity, variant: "warning" as const },
];

function BrandMark() {
  return <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[var(--ds-foreground)] text-[var(--ds-background)] shadow-[var(--ds-shadow-glow)]" aria-hidden="true"><span className="absolute inset-0 bg-[linear-gradient(135deg,transparent_25%,var(--ds-primary)_140%)]" /><BarChart3 className="relative size-5" /></span>;
}

export function Showcase() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="ds-root ds-grid-bg min-h-screen bg-[var(--ds-background)] text-[var(--ds-foreground)]">
        <a href="#design-content" className="ds-focus fixed start-4 top-4 z-[70] -translate-y-24 rounded-lg bg-[var(--ds-foreground)] px-4 py-2 text-sm text-[var(--ds-background)] focus:translate-y-0">پرش به محتوای اصلی</a>
        <div className="flex min-h-screen">
          {mobileOpen && <button className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-label="بستن منو" onClick={() => setMobileOpen(false)} />}
          <aside className={cn("ds-glass fixed inset-y-0 start-0 z-40 flex flex-col border-e border-[var(--ds-border)] transition-[width,transform] duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0", collapsed ? "w-[84px]" : "w-[280px]", mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0")}>
            <div className="flex h-20 items-center gap-3 border-b border-[var(--ds-border)] px-5">
              <BrandMark />
              {!collapsed && <div className="min-w-0"><strong className="block truncate text-sm font-extrabold">دیدبان مالی</strong><span className="block truncate text-[10px] text-[var(--ds-foreground-faint)]">Financial Intelligence OS</span></div>}
            </div>
            <nav className="flex-1 space-y-1.5 overflow-y-auto p-3" aria-label="ناوبری اصلی">
              {!collapsed && <p className="px-3 pb-2 pt-3 text-[10px] font-bold text-[var(--ds-foreground-faint)]">فضای تحلیل</p>}
              {navigation.map((item) => <Tooltip key={item.label}><TooltipTrigger asChild><button className={cn("ds-focus flex min-h-11 w-full items-center rounded-xl text-sm font-bold transition-colors", collapsed ? "justify-center px-0" : "gap-3 px-3", item.active ? "bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]" : "text-[var(--ds-foreground-soft)] hover:bg-[var(--ds-muted)] hover:text-[var(--ds-foreground)]")}><item.icon className="size-[18px] shrink-0" /><span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>{item.count && !collapsed && <Badge variant="danger" className="ms-auto">{item.count}</Badge>}</button></TooltipTrigger>{collapsed && <TooltipContent side="left">{item.label}</TooltipContent>}</Tooltip>)}
            </nav>
            <div className="border-t border-[var(--ds-border)] p-3">
              <button className={cn("ds-focus flex min-h-12 w-full items-center rounded-xl bg-[var(--ds-muted)]", collapsed ? "justify-center" : "gap-3 px-3")}><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--ds-accent-soft)] text-xs font-extrabold text-[var(--ds-accent)]">مت</span>{!collapsed && <span className="min-w-0 text-start"><strong className="block truncate text-xs">مهدی تهرانی</strong><small className="block truncate text-[9px] text-[var(--ds-foreground-faint)]">مدیر مالی</small></span>}</button>
              <Button variant="ghost" size="icon" className="mt-2 hidden w-full lg:flex" aria-label={collapsed ? "بازکردن نوار کناری" : "جمع‌کردن نوار کناری"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronsLeft /> : <ChevronsRight />}</Button>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <header className="ds-glass sticky top-0 z-20 flex h-20 items-center gap-3 border-b border-[var(--ds-border)] px-4 md:px-6 xl:px-8">
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="بازکردن منو" onClick={() => setMobileOpen(true)}><Menu /></Button>
              <div className="hidden min-w-0 md:block"><p className="text-[10px] text-[var(--ds-foreground-faint)]">سیستم طراحی / نمای زنده</p><h1 className="truncate text-sm font-extrabold">مرکز کنترل مالی</h1></div>
              <div className="relative me-auto hidden w-full max-w-sm lg:block"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--ds-foreground-faint)]" /><Input className="ps-10 pe-14" aria-label="جست‌وجوی سراسری" placeholder="جست‌وجوی سند، حساب یا یافته…" /><kbd className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md border border-[var(--ds-border)] px-1.5 py-0.5 text-[9px] text-[var(--ds-foreground-faint)]">⌘ K</kbd></div>
              <ThemeToggle />
              <Button variant="outline" size="icon" aria-label="اعلان‌ها" className="relative"><Bell /><span className="absolute end-2 top-2 size-1.5 rounded-full bg-[var(--ds-danger)]" /></Button>
              <Select defaultValue="arya" dir="rtl"><SelectTrigger className="hidden w-52 md:flex" aria-label="انتخاب شرکت"><Building2 className="size-4 text-[var(--ds-primary)]" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="arya">راهکار تجارت آریا</SelectItem><SelectItem value="dorsa">صنایع درسا</SelectItem></SelectContent></Select>
            </header>

            <main id="design-content" className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6 xl:p-8">
              <section className="relative overflow-hidden rounded-[var(--ds-p-radius-xl)] border border-[var(--ds-border)] bg-[var(--ds-background-raised)] p-6 shadow-[var(--ds-shadow-md)] md:p-8" aria-labelledby="hero-title">
                <div className="pointer-events-none absolute -start-20 -top-28 size-72 rounded-full bg-[var(--ds-primary)] opacity-[.12] blur-3xl" /><div className="pointer-events-none absolute -bottom-28 end-0 size-80 rounded-full bg-[var(--ds-accent)] opacity-[.12] blur-3xl" />
                <div className="relative flex flex-col justify-between gap-8 xl:flex-row xl:items-end">
                  <div className="max-w-3xl"><div className="mb-4 flex flex-wrap items-center gap-2"><Badge variant="accent"><Sparkles /> نسخهٔ پایه ۱.۰</Badge><Badge variant="outline">RTL Native</Badge><Badge variant="outline">Light + Dark</Badge></div><h2 id="hero-title" className="text-[length:var(--ds-font-display)] font-extrabold leading-[1.35] tracking-[-.035em]">تصمیم مالی، با <span className="bg-[linear-gradient(90deg,var(--ds-primary),var(--ds-accent))] bg-clip-text text-transparent">وضوح عملیاتی</span>.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--ds-foreground-soft)] md:text-base">نمای زندهٔ سیستم طراحی دیدبان مالی؛ ترکیبی از دقت سازمانی، نوآوری بصری و خوانایی داده‌های پرتراکم.</p></div>
                  <div className="flex flex-wrap gap-2"><Dialog><DialogTrigger asChild><Button><Blocks /> مشاهده اجزا</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>کتابخانهٔ اجزای دیدبان</DialogTitle><DialogDescription>این بسته روی shadcn/ui و Radix ساخته شده و توکن‌ها، حالت‌ها، دسترس‌پذیری و راست‌به‌چپ را از یک منبع مشترک می‌گیرد.</DialogDescription></DialogHeader><div className="flex flex-wrap gap-2"><Badge>اصلی</Badge><Badge variant="success">موفق</Badge><Badge variant="warning">هشدار</Badge><Badge variant="danger">خطا</Badge></div><DialogFooter><DialogClose asChild><Button variant="outline">بستن</Button></DialogClose><Button onClick={() => toast.success("جزء نمونه با موفقیت اجرا شد.")}>اجرای نمونه</Button></DialogFooter></DialogContent></Dialog><Button variant="outline" onClick={() => document.getElementById("component-lab")?.scrollIntoView({ behavior: "smooth" })}><Command /> راهنمای الگوها</Button></div>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-3" aria-label="شاخص‌های کلیدی نمونه">{metrics.map((metric) => <Card key={metric.title} className="group overflow-hidden transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--ds-shadow-md)]"><CardContent className="flex items-start gap-4 pt-5 md:pt-6"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]"><metric.icon className="size-5" /></span><div className="min-w-0"><p className="text-xs text-[var(--ds-foreground-soft)]">{metric.title}</p><p className="ds-persian-numerals mt-2 text-2xl font-extrabold tracking-tight">{metric.value}</p><p className="mt-1 text-[10px] text-[var(--ds-foreground-faint)]">{metric.unit}</p></div><Badge variant={metric.variant} className="ms-auto">{metric.delta}</Badge></CardContent></Card>)}</section>

              <section className="grid gap-4 xl:grid-cols-[1.45fr_.75fr]">
                <Card><CardHeader className="flex-row items-start justify-between"><div><CardTitle>روند جریان نقدی</CardTitle><CardDescription>مقایسهٔ ورودی و خروجی شش ماه اخیر — میلیارد ریال</CardDescription></div><div className="flex gap-3 text-[10px] text-[var(--ds-foreground-soft)]"><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--ds-primary)]" />ورودی</span><span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[var(--ds-accent)]" />خروجی</span></div></CardHeader><CardContent><CashflowChart /></CardContent></Card>
                <Card className="overflow-hidden"><CardHeader><div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-xl bg-[var(--ds-accent-soft)] text-[var(--ds-accent)]"><ShieldCheck className="size-5" /></span><Badge variant="success">پایدار</Badge></div><CardTitle className="mt-3">سلامت کنترل‌ها</CardTitle><CardDescription>پوشش کنترل‌های حیاتی این دوره</CardDescription></CardHeader><CardContent className="space-y-5"><div><div className="mb-2 flex justify-between text-xs"><span>کنترل اسناد</span><strong>۹۸٪</strong></div><Progress value={98} /></div><div><div className="mb-2 flex justify-between text-xs"><span>تطبیق بانکی</span><strong>۸۶٪</strong></div><Progress value={86} /></div><div><div className="mb-2 flex justify-between text-xs"><span>کنترل دسترسی</span><strong>۹۳٪</strong></div><Progress value={93} /></div><div className="rounded-xl border border-[var(--ds-border)] bg-[var(--ds-muted)] p-3 text-xs leading-6 text-[var(--ds-foreground-soft)]"><Bot className="me-2 inline size-4 text-[var(--ds-accent)]" />تحلیل هوشمند در این نما صرفاً نمونه است و بدون تأیید انسانی اقدامی انجام نمی‌دهد.</div></CardContent></Card>
              </section>

              <Card><CardHeader className="flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><CardTitle>تطبیق تراکنش‌ها</CardTitle><CardDescription>نمونهٔ نمای پرتراکم برای کارشناس مالی</CardDescription></div><div className="flex gap-2"><Badge variant="secondary">۴ ردیف</Badge><Button variant="outline" size="sm"><Table2 /> تنظیم ستون‌ها</Button></div></CardHeader><CardContent className="px-0 pb-0"><ReconciliationTable /></CardContent></Card>

              <section id="component-lab" className="scroll-mt-24 space-y-4" aria-labelledby="lab-title"><div><Badge variant="accent">Component Lab</Badge><h2 id="lab-title" className="mt-3 text-xl font-extrabold md:text-2xl">زبان مشترک محصول و طراحی</h2><p className="mt-2 text-sm text-[var(--ds-foreground-soft)]">نمونهٔ حالت‌ها، رنگ‌ها و کنترل‌های پایه در هر دو تم</p></div><div className="grid gap-4 xl:grid-cols-3"><Card><CardHeader><CardTitle>اقدام‌ها</CardTitle><CardDescription>سلسله‌مراتب روشن و حداقل ارتفاع لمس ۴۴ پیکسل</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button>ثبت و ادامه</Button><Button variant="secondary">عملیات دوم</Button><Button variant="outline">نمایش بیشتر</Button><Button variant="ghost">انصراف</Button><Button variant="destructive">حذف</Button></CardContent></Card><Card><CardHeader><CardTitle>وضعیت‌ها</CardTitle><CardDescription>هیچ وضعیت مهمی فقط با رنگ منتقل نمی‌شود</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Badge>فعال</Badge><Badge variant="success"><BadgeCheck /> تأییدشده</Badge><Badge variant="warning"><TriangleAlert /> بررسی</Badge><Badge variant="danger">مسدود</Badge><Badge variant="outline">پیش‌نویس</Badge></CardContent></Card><Card><CardHeader><CardTitle>ورودی داده</CardTitle><CardDescription>کنترل‌های دقیق با حلقهٔ فوکوس قابل مشاهده</CardDescription></CardHeader><CardContent className="space-y-3"><label htmlFor="sample-account" className="text-xs font-bold">کد حساب</label><Input id="sample-account" className="ds-latin" placeholder="1102-04" /><div className="flex gap-2"><Button className="flex-1" onClick={() => toast.success("مقدار نمونه ذخیره شد.")}>ذخیره نمونه</Button><Button variant="outline" size="icon" aria-label="تنظیمات"><Settings2 /></Button></div></CardContent></Card></div></section>
            </main>
          </div>
        </div>
        <Toaster position="bottom-left" dir="rtl" richColors closeButton />
      </div>
    </TooltipProvider>
  );
}
