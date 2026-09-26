"use client";

import Link from "next/link";
import {
  Building2,
  Calendar,
  Coins,
  ShieldCheck,
  Users,
  Clock,
  ArrowRight,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, toPersianDigits } from "@/components/ui/financial";
import { useWorkspace } from "@/components/product/workspace-provider";

const JALALI_MONTH_NAMES: Record<number, string> = {
  1: "فروردین (۰۱/۰۱)",
  2: "اردیبهشت (۰۲/۰۱)",
  3: "خرداد (۰۳/۰۱)",
  4: "تیر (۰۴/۰۱)",
  5: "مرداد (۰۵/۰۱)",
  6: "شهریور (۰۶/۰۱)",
  7: "مهر (۰۷/۰۱)",
  8: "آبان (۰۸/۰۱)",
  9: "آذر (۰۹/۰۱)",
  10: "دی (۱۰/۰۱)",
  11: "بهمن (۱۱/۰۱)",
  12: "اسفند (۱۲/۰۱)",
};

export default function CompanyProfilePage() {
  const { company } = useWorkspace();
  const fiscalMonth = company.fiscal_year_start_month ?? 1;
  const fiscalMonthLabel = JALALI_MONTH_NAMES[fiscalMonth] || `ماه ${toPersianDigits(fiscalMonth)}`;

  return (
    <div className="space-y-6 pb-12 max-w-4xl" dir="rtl">
      {/* Page Header */}
      <PageHeader
        title="پروفایل و تنظیمات شرکت"
        description="مشخصات هویتی، تقویم مالی، واحد پولی گزارشگری و ضوابط حاکمیت شرکتی"
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            <Building2 className="size-3.5" />
            تنظیمات سازمان
          </span>
        }
        secondaryActions={
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-bold rounded-xl">
            <Link href={`/companies/${company.id}/settings/members`}>
              <Users className="size-3.5" />
              <span>مدیریت اعضای تیم</span>
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6">
        {/* Section 1: Basic Identity */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="p-5 pb-3 border-b border-border/70">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Building2 className="size-4 text-primary" />
              <span>اطلاعات پایه و هویتی شرکت</span>
            </CardTitle>
            <CardDescription className="text-xs">
              مشخصات ثبت‌شده در سامانه و شناسه ملی رسمی جهت انطباق مالیاتی و گزارشگری
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
                <dt className="text-muted-foreground font-medium">نام حقوقی رسمی</dt>
                <dd className="font-bold text-foreground text-sm">{company.legal_name}</dd>
              </div>
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
                <dt className="text-muted-foreground font-medium">شناسه ملی شرکت</dt>
                <dd dir="ltr" className="font-mono font-bold text-foreground text-sm">
                  {company.national_id ? toPersianDigits(company.national_id) : "ثبت‌نشده"}
                </dd>
              </div>
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
                <dt className="text-muted-foreground font-medium">نقش کاربری شما</dt>
                <dd className="flex items-center gap-2 pt-0.5">
                  <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20 font-bold">
                    {company.role === "finance_manager"
                      ? "مدیر ارشد مالی"
                      : company.role === "advisor"
                      ? "مشاور مالی"
                      : "مشاهده‌گر"}
                  </Badge>
                </dd>
              </div>
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
                <dt className="text-muted-foreground font-medium">وضعیت حساب شرکتی</dt>
                <dd className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold pt-0.5">
                  <CheckCircle2 className="size-3.5" />
                  <span>فعال و دارای دسترسی کامل</span>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Section 2: Fiscal Year & Calendar */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="p-5 pb-3 border-b border-border/70">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Calendar className="size-4 text-primary" />
              <span>سال مالی و تقویم کاری</span>
            </CardTitle>
            <CardDescription className="text-xs">
              مبنای زمان‌بندی محاسبات استهلاک، بستن حساب‌ها و دوره‌های مقایسه‌ای صورت‌های مالی
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
                <dt className="text-muted-foreground font-medium">ماه شروع سال مالی</dt>
                <dd className="font-bold text-foreground text-sm">{fiscalMonthLabel}</dd>
              </div>
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
                <dt className="text-muted-foreground font-medium">منطقه زمانی پردازش اسناد</dt>
                <dd dir="ltr" className="font-mono font-bold text-foreground text-sm">
                  {company.timezone || "Asia/Tehran"} (تهران / ایران)
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Section 3: Currency & Reporting Units */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="p-5 pb-3 border-b border-border/70">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Coins className="size-4 text-primary" />
              <span>واحد پولی و استاندارد گزارشگری</span>
            </CardTitle>
            <CardDescription className="text-xs">
              قواعد تبدیل و نمایش ارقام در داشبوردهای مدیریتی و ترازنامه‌های قانونی
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
                <dt className="text-muted-foreground font-medium">واحد پایه ذخیره‌سازی داده‌ها</dt>
                <dd className="font-bold text-foreground text-sm">ریال ایران (IRR) — دقت قانونی کامل</dd>
              </div>
              <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1">
                <dt className="text-muted-foreground font-medium">واحد نمایشی داشبورد مدیریتی</dt>
                <dd className="font-bold text-foreground text-sm">تومان / میلیارد تومان با تولتیپ ریال</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Section 4: Governance & Maker-Checker Settings */}
        <Card className="border-border bg-card shadow-xs">
          <CardHeader className="p-5 pb-3 border-b border-border/70">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <ShieldCheck className="size-4 text-primary" />
              <span>حاکمیت مالی و کنترل داخلی</span>
            </CardTitle>
            <CardDescription className="text-xs">
              سازوکارهای نظارتی، تفکیک وظایف و ثبت ردهای غیرقابل‌تغییر در زنجیره حسابرسی
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-foreground">
              <Lock className="size-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="block font-bold">اصل تفکیک وظایف دو امضایی (Maker-Checker):</strong>
                <p className="text-muted-foreground leading-relaxed">
                  فعال — هیچ کاربری مجاز به تایید و بستن نهایی یافته یا سندی که خود ثبت یا حل کرده است نیست.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-muted/20 text-xs text-foreground">
              <Clock className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <strong className="block font-bold">رد حسابرسی تغییرناپذیر (Immutable Audit Trail):</strong>
                <p className="text-muted-foreground leading-relaxed">
                  تمام اقدامات، تغییرات وضعیت، بارگذاری فایل‌ها و تصمیمات مالی با شناسه کاربر و زمان دقیق ثبت می‌شوند.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

