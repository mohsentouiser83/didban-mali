"use client";

import { Checkbox } from "@/components/ui/checkbox";

import { useEffect, useState, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Database,
  ArrowLeftRight,
  ScanSearch,
  WalletCards,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Rocket,
  Compass,
  FileSpreadsheet,
  AlertTriangle,
  TrendingUp,
} from "@/components/ui/icons";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/date-utils";
import { Input } from "@/components/ui/input";

export interface TourStep {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  route?: string;
  routeLabel?: string;
  features: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    detail: string;
  }[];
  metricBadge: {
    label: string;
    value: string;
    subtext: string;
    variant: "success" | "warning" | "info" | "primary";
  };
}

export interface ProductTourProps {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storageKey?: string;
}

export function ProductTour({
  companyId,
  open,
  onOpenChange,
  storageKey = "didban_user_tour_completed",
}: ProductTourProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const titleId = useId();
  const descId = useId();

  const tourSteps: TourStep[] = [
    {
      id: "welcome",
      badge: "آشنایی با سامانه",
      title: "خوش‌آمدید به دیدبان مالی",
      subtitle: "لایه هوشمندی، تطبیق و کنترل اسناد مالی برای شرکت‌های ایرانی",
      description:
        "دیدبان مالی جایگزین نرم‌افزار حسابداری شما نیست؛ بلکه دستیار هوشمند و دیدبان داده‌های مالی، گردش بانک و سامانه‌های فروش شماست تا خطاهای انسانی، مغایرت‌ها و ریسک‌های نقدینگی را پیش از تبدیل شدن به بحران شناسایی کند.",
      icon: Sparkles,
      features: [
        {
          icon: FileSpreadsheet,
          title: "تلفیق ۳ منبع کلیدی داده",
          detail:
            "دریافت همزمان دفاتر حسابداری، صورت‌حساب بانک و گزارش‌های فروش بدون تغییر نرم‌افزار فعلی شما.",
        },
        {
          icon: ScanSearch,
          title: "کشف هوشمند ناهنجاری‌ها",
          detail:
            "اجرای بیش از ده‌ها قاعده پایش مالی و مالیاتی بدون نیاز به بررسی دستی و زمان‌بر اسناد.",
        },
        {
          icon: ShieldCheck,
          title: "شفافیت و ردگیری کامل (Lineage)",
          detail:
            "هر یافته مستقیماً به شماره سند، کد حسابداری و ردیف فایل اولیه متصل است.",
        },
      ],
      metricBadge: {
        label: "وضعیت پایش زنده",
        value: "۱۰۰٪ آماده پایش",
        subtext: "۱۴ فاز کنترل مالی و تطبیق فعال در سامانه",
        variant: "success",
      },
    },
    {
      id: "data",
      badge: "گام ۱ از ۵ • ورود داده‌ها",
      title: "مرکز داده‌ها و بارگذاری هوشمند",
      subtitle: "پذیرش فایل‌های اکسل، CSV و ارتباط مستقیم با سیستم‌ها",
      description:
        "در مرکز داده‌ها، فایل‌های تراز کل، معین، گردش حساب‌های بانکی و صورت‌های فروش را بارگذاری کنید. سامانه داده‌ها را اسکن امنیتی کرده، نگاشت فیلدها را به طور خودکار پیشنهاد داده و خطاها را برطرف می‌کند.",
      icon: Database,
      route: `/companies/${companyId}/data`,
      routeLabel: "مشاهده مرکز داده‌ها",
      features: [
        {
          icon: ShieldCheck,
          title: "اسکن امنیتی ضد بدافزار",
          detail:
            "بررسی بلادرنگ و تضمین سلامت امنیتی کلیه فایل‌های ورودی پیش از پردازش.",
        },
        {
          icon: FileSpreadsheet,
          title: "نگاشت هوشمند ستون‌ها",
          detail:
            "انطباق خودکار فیلدهای فایل با استانداردهای حسابداری و ذخیره الگو برای بارگذاری‌های آتی.",
        },
        {
          icon: CheckCircle2,
          title: "اعتبارسنجی کیفیت و تاریخ شمسی",
          detail:
            "شناسایی ردیف‌های نامعتبر، رفع داده‌های پوچ و تبدیل خودکار تقویم جلالی.",
        },
      ],
      metricBadge: {
        label: "پوشش داده‌های ورودی",
        value: "۳ منبع اصلی",
        subtext: "تراز کل و معین، ریزگردش بانک و گزارش‌های فروش",
        variant: "info",
      },
    },
    {
      id: "reconciliation",
      badge: "گام ۲ از ۵ • مغایرت‌گیری",
      title: "تطبیق خودکار بانک و دفاتر کل",
      subtitle: "کشف سریع اقلام باز و تسویه نشده بدون مغایرت‌گیری دستی",
      description:
        "موتور تطبیق دیدبان، تراکنش‌های بانکی را با اسناد دفتر کل بر مبنای شناسه پیگیری، مبلغ، تاریخ شمسی و طرف‌حساب متناظر کرده و مغایرت‌ها را با ضریب اطمینان تفکیک می‌نماید.",
      icon: ArrowLeftRight,
      route: `/companies/${companyId}/reconciliation`,
      routeLabel: "مشاهده میز کار تطبیق",
      features: [
        {
          icon: ArrowLeftRight,
          title: "تطبیق چندمعیاره و فازی",
          detail:
            "تطبیق خودکار هوشمند با در نظر گرفتن تلورانس تاریخ و شناسه‌های چندتکه واریز.",
        },
        {
          icon: AlertTriangle,
          title: "تفکیک فوری اقلام باز",
          detail:
            "نمایش فوری واریزهای فاقد سند در دفاتر یا اسناد صادرشده فاقد ثبت بانکی.",
        },
        {
          icon: CheckCircle2,
          title: "ثبت مستقیم سند اصلاحی",
          detail:
            "امکان یادداشت‌گذاری، ثبت شماره سند اصلاحی و رفع مغایرت در همان صفحه.",
        },
      ],
      metricBadge: {
        label: "نرخ تطبیق هوشمند",
        value: "۹۴٫۲٪ خودکار",
        subtext: "صرفه‌جویی چشمگیر در زمان بستن حساب‌های پایان ماه",
        variant: "primary",
      },
    },
    {
      id: "findings",
      badge: "گام ۳ از ۵ • کشف ناهنجاری",
      title: "موتور یافته‌ها و زنجیره شواهد",
      subtitle: "کشف فاکتورهای تکراری، انحرافات هزینه و جرایم مالیاتی",
      description:
        "موارد نیازمند رسیدگی را اولویت‌بندی کنید، شواهد هر مورد را ببینید و نتیجه بررسی را ثبت کنید.",
      icon: ScanSearch,
      route: `/companies/${companyId}/findings`,
      routeLabel: "مشاهده فهرست یافته‌ها",
      features: [
        {
          icon: AlertTriangle,
          title: "اولویت‌بندی ۴ سطحی ریسک",
          detail:
            "تمرکز بر موارد پرخطر مانند فاکتورهای تکراری یا عدم تعادل در گردش حساب.",
        },
        {
          icon: ShieldCheck,
          title: "زنجیره شواهد غیرقابل انکار (Lineage)",
          detail:
            "دسترسی مستقیم به خط و ستون فایل اکسل اولیه برای هر ادعای مالیاتی یا کنترلی.",
        },
        {
          icon: ClipboardCheck,
          title: "ارجاع به کارشناس مسئول",
          detail:
            "امکان انتساب یافته به همکاران مالی، تعیین مهلت و پیگیری فرآیند تا حصول نتیجه.",
        },
      ],
      metricBadge: {
        label: "پایش فعال",
        value: "بیش از ۵۰ قاعده",
        subtext: "رصد همزمان خطاهای محاسباتی، تعهدات و ریسک مالیاتی",
        variant: "warning",
      },
    },
    {
      id: "cashflow",
      badge: "گام ۴ از ۵ • آینده‌نگری مالی",
      title: "پیش‌بینی نقدینگی و تحلیل سناریو",
      subtitle: "پیش‌بینی جریان وجوه نقد ۳۰ تا ۹۰ روز آینده و پایش وصول",
      description:
        "دیدبان مالی علاوه بر رصد موجودی روزانه بانک‌ها، جریان نقدینگی آتی را بر اساس سوابق تاریخی وصول پیش‌بینی کرده و امکان شبیه‌سازی اثر شوک‌های مالی بر تاب‌آوری شرکت را به شما می‌دهد.",
      icon: WalletCards,
      route: `/companies/${companyId}/cashflow`,
      routeLabel: "مشاهده داشبورد نقدینگی",
      features: [
        {
          icon: TrendingUp,
          title: "پیش‌بینی ۳۰ تا ۹۰ روزه نقدینگی",
          detail:
            "برآورد دقیق ورودی و خروجی نقدی بر مبنای میانگین تاریخی وصول مطالبات.",
        },
        {
          icon: WalletCards,
          title: "تحلیل سنی مطالبات و بدهی‌ها (Aging)",
          detail:
            "پایش مطالبات معوق، رسوب حساب مشتریان و اولویت‌بندی پرداخت به تامین‌کنندگان.",
        },
        {
          icon: Sparkles,
          title: "شبیه‌سازی سناریوهای مالی",
          detail:
            "تست آنی شوک‌های بازار نظیر افت ۲۰ درصدی فروش یا تاخیر ۳۰ روزه در وصول فاکتورها.",
        },
      ],
      metricBadge: {
        label: "افق پیش‌بینی مطمئن",
        value: "تا ۹۰ روز آتی",
        subtext: "کاهش ریسک برگشت چک و کسری غیرمنتظره نقدینگی",
        variant: "primary",
      },
    },
    {
      id: "actions",
      badge: "گام ۵ از ۵ • اقدام و نتیجه‌گیری",
      title: "کارتابل اقدامات من و گزارش‌های رسمی",
      subtitle: "گردش تاییدات، یادداشت‌های تصمیم و صدور PDF",
      description:
        "تمام کارهای نیازمند اقدام در کارتابل «کارهای من» تجمیع می‌شوند. پس از رفع نقایص، می‌توانید یادداشت‌های رسمی تصمیم (Decision Memo) صادر کرده و گزارش‌های تاییدشده مالی را در قالب PDF دریافت کنید.",
      icon: ClipboardCheck,
      route: `/companies/${companyId}/actions`,
      routeLabel: "مشاهده کارتابل اقدامات من",
      features: [
        {
          icon: ClipboardCheck,
          title: "کارتابل متمرکز اقدامات من",
          detail:
            "صف کار شفاف برای پیگیری وظایف، بدون خطر جا ماندن حتی یک پرونده مالی.",
        },
        {
          icon: ShieldCheck,
          title: "یادداشت‌های تصمیم مالی (Decision Memo)",
          detail:
            "مستندسازی رسمی تصمیمات مدیران مالی برای ارائه به ممیزان و حسابرسان.",
        },
        {
          icon: Rocket,
          title: "گزارش‌های تحلیلی مدیریتی PDF",
          detail:
            "تولید خودکار گزارش‌های جامع قابل چاپ با نمودارها و شاخص‌های کلیدی عملکرد.",
        },
      ],
      metricBadge: {
        label: "گزارش‌های استاندارد",
        value: "PDF و تایید دیجیتال",
        subtext: "مستندسازی بدون ابهام برای مدیرعامل و هیئت مدیره",
        variant: "success",
      },
    },
  ];

  const totalSteps = tourSteps.length;
  const current = tourSteps[currentStep];

  const handleClose = useCallback(() => {
    if (dontShowAgain && typeof window !== "undefined") {
      try {
        localStorage.setItem(storageKey, "true");
      } catch {
        /* silent */
      }
    }
    onOpenChange(false);
  }, [dontShowAgain, onOpenChange, storageKey]);

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setDirection("forward");
      setCurrentStep((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setDirection("backward");
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleJumpToRoute = (route: string) => {
    handleClose();
    router.push(route);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      } else if (e.key === "ArrowLeft") {
        // In RTL, left arrow moves forward (Next)
        if (currentStep < totalSteps - 1) {
          setDirection("forward");
          setCurrentStep((p) => p + 1);
        }
      } else if (e.key === "ArrowRight") {
        // In RTL, right arrow moves backward (Previous)
        if (currentStep > 0) {
          setDirection("backward");
          setCurrentStep((p) => p - 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, currentStep, totalSteps, handleClose]);

  if (!open) return null;

  const StepIcon = current.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[rgb(24_45_59_/_32%)]  transition-all   duration-200"
      dir="rtl"
    >
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-[var(--ds-card-radius)] sm:rounded-[var(--ds-card-radius)] border border-border/80 bg-card text-card-foreground shadow-[var(--ds-shadow-xl)] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-[var(--ds-card-radius)] bg-primary/15 text-primary">
              <Compass className="size-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">
                  تور آشنایی با دیدبان مالی
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary font-sans">
                  گام {toPersianDigits(currentStep + 1)} از{" "}
                  {toPersianDigits(totalSteps)}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">
                راهنمای سریع شروع به کار و امکانات کلیدی
              </span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="size-8 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            aria-label="بستن تور"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Progress Bar & Steps Tabs */}
        <div className="border-b border-border/40 bg-muted/15 px-5 py-2.5">
          <div className="flex items-center justify-between gap-1.5 sm:gap-2">
            {tourSteps.map((step, idx) => {
              const isCurrent = idx === currentStep;
              const isCompleted = idx < currentStep;
              return (
                <Button
                  variant="surface"
                  size="auto"
                  motion="none"
                  key={step.id}
                  type="button"
                  onClick={() => {
                    setDirection(idx >= currentStep ? "forward" : "backward");
                    setCurrentStep(idx);
                  }}
                  className={cn(
                    "flex-1 group flex flex-col items-center gap-1.5 py-1 rounded-lg transition-all cursor-pointer text-center",
                    isCurrent
                      ? "text-primary font-bold"
                      : isCompleted
                        ? "text-muted-foreground hover:text-foreground font-medium"
                        : "text-muted-foreground/50 hover:text-muted-foreground font-medium",
                  )}
                  title={step.title}
                >
                  <div
                    className={cn(
                      "h-1.5 w-full rounded-full transition-all duration-300 ease-out",
                      isCurrent
                        ? "bg-primary shadow-none "
                        : isCompleted
                          ? "bg-ds-success/70"
                          : "bg-border/60 group-hover:bg-border",
                    )}
                  />
                  <span className="hidden sm:inline-block text-[10px] transition-colors truncate max-w-[85px]">
                    {step.badge.split("•")[0]?.trim() || `گام ${idx + 1}`}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Modal Scrollable Content with Step Animation */}
        <div
          key={currentStep}
          className={cn(
            "overflow-y-auto px-5 py-6 space-y-6",
            direction === "forward"
              ? "tour-animated-forward"
              : "tour-animated-backward",
          )}
        >
          {/* Main Title & Description */}
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="relative group shrink-0">
              <div className="absolute -inset-1 rounded-[var(--ds-card-radius)] bg-primary/20 blur-md animate-pulse opacity-70" />
              <div className="relative flex size-14 shrink-0 items-center justify-center rounded-[var(--ds-card-radius)] bg-primary/10 text-primary border border-primary/20 shadow-xs tour-animated-pop">
                <StepIcon className="size-7 transition-transform duration-300 " />
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[11px] font-bold">
                  {current.badge}
                </span>
                {currentStep === totalSteps - 1 && (
                  <span className="rounded-full bg-ds-success/15 text-ds-success border border-ds-success/30 px-2.5 py-0.5 text-[11px] font-bold tour-celebrate-badge">
                    🎉 آماده شروع به کار
                  </span>
                )}
                {current.route && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleJumpToRoute(current.route!)}
                    className="text-[11px] gap-1 "
                  >
                    <span>{current.routeLabel || "مشاهده این بخش"}</span>
                    <ExternalLink className="size-3" />
                  </Button>
                )}
              </div>

              <h2
                id={titleId}
                className="text-lg sm:text-xl font-bold text-foreground leading-snug"
              >
                {current.title}
              </h2>
              <p className="text-xs sm:text-sm font-medium text-primary/90">
                {current.subtitle}
              </p>
              <p
                id={descId}
                className="text-xs sm:text-sm text-muted-foreground leading-relaxed pt-1"
              >
                {current.description}
              </p>
            </div>
          </div>

          {/* Interactive Metric / Spotlight Box with Shimmer Animation */}
          <div
            className={cn(
              "tour-shimmer-effect flex flex-wrap items-center justify-between gap-3 rounded-[var(--ds-card-radius)] border p-4 transition-all duration-300",
              current.metricBadge.variant === "success"
                ? "border-ds-success/30 bg-ds-success/10 text-ds-success"
                : current.metricBadge.variant === "warning"
                  ? "border-ds-warning/30 bg-ds-warning/10 text-ds-warning"
                  : current.metricBadge.variant === "primary"
                    ? "border-primary/30 bg-primary/10 text-primary-foreground"
                    : "border-primary/30 bg-primary/10 text-primary",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--ds-card-radius)] bg-background/80 shadow-2xs">
                <StepIcon className="size-5 text-foreground" />
              </div>
              <div>
                <span className="block text-[11px] font-medium opacity-80 text-foreground">
                  {current.metricBadge.label}
                </span>
                <strong className="block text-sm sm:text-base font-bold text-foreground">
                  {current.metricBadge.value}
                </strong>
              </div>
            </div>

            <span className="text-[11px] text-muted-foreground font-medium sm:text-end max-w-xs">
              {current.metricBadge.subtext}
            </span>
          </div>

          {/* Feature highlights list with Staggered Entrance */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-bold text-foreground">
              قابلیت‌های برجسته این بخش:
            </h4>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {current.features.map((feat, i) => {
                const FeatIcon = feat.icon;
                const staggerClass =
                  i === 0
                    ? "tour-stagger-1"
                    : i === 1
                      ? "tour-stagger-2"
                      : "tour-stagger-3";
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-[var(--ds-card-radius)] border border-border/60 bg-muted/20 p-3 hover:border-primary/30 hover:bg-muted/30 transition-all duration-200  ",
                      staggerClass,
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FeatIcon className="size-3.5" />
                      </div>
                      <strong className="text-xs font-bold text-foreground truncate">
                        {feat.title}
                      </strong>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-normal line-clamp-3">
                      {feat.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox
                checked={dontShowAgain}
                onCheckedChange={(checked) =>
                  setDontShowAgain(checked === true)
                }
              />
              <span>عدم نمایش خودکار در دفعات بعدی</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrev}
                className="group gap-1 cursor-pointer "
              >
                <ChevronRight className="size-4 transition-transform duration-200 " />
                <span>گام قبلی</span>
              </Button>
            )}

            {currentStep < totalSteps - 1 ? (
              <Button variant="default"
                size="sm"
                onClick={handleNext}
                className="group gap-1 cursor-pointer "
              >
                <span>گام بعدی</span>
                <ChevronLeft className="size-4 transition-transform duration-200 " />
              </Button>
            ) : (
              <Button variant="success"
                size="sm"
                onClick={handleClose}
                className="gap-1.5 cursor-pointer "
              >
                <CheckCircle2 className="size-4" />
                <span>شروع به کار در دیدبان مالی</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
