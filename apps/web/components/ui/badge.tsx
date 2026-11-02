import { cn } from "@/lib/utils";
const labels: Record<string, string> = {
  accepted: "پذیرفته‌شده",
  accepted_in_group: "پذیرفته در گروه",
  needs_review: "نیازمند بررسی",
  exact_proposal: "پیشنهاد تطبیق",
  settled: "تسویه‌شده",
  overdue: "سررسیدگذشته",
  credit: "اعتبار طرف حساب",
  receiving: "دریافت فایل",
  sealed: "در صف پردازش",
  processing: "در حال پردازش",
  waiting_input: "نیازمند پاسخ",
  waiting_dependency: "در انتظار سرویس",
  completed: "تکمیل‌شده",
  completed_limited: "نتیجه محدود",
  failed: "ناموفق",
  cancelled: "لغوشده",
  ready: "آماده",
  clean: "سالم",
  rejected: "ردشده",
  available: "موجود",
  limited: "محدود",
  unavailable: "ناموجود",
  estimated: "برآوردی",
  open: "باز",
  resolved: "رسیدگی‌شده",
  confirmed: "تأییدشده",
  pending: "در انتظار",
  approved: "تأیید مالی",
  archived: "بایگانی",
  development_unscanned: "بدون اسکن؛ محیط توسعه",
};
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "primary";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
        {
          "bg-canvas text-muted": tone === "neutral",
          "bg-success-soft text-success": tone === "success",
          "bg-warning-soft text-warning": tone === "warning",
          "bg-danger-soft text-danger": tone === "danger",
          "bg-primary-soft text-primary": tone === "primary",
        },
        className,
      )}
    >
      {children}
    </span>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const tone = [
    "completed",
    "clean",
    "available",
    "approved",
    "settled",
    "accepted",
    "accepted_in_group",
  ].includes(status)
    ? "success"
    : [
          "overdue",
          "needs_review",
          "waiting_input",
          "completed_limited",
          "limited",
          "estimated",
          "development_unscanned",
        ].includes(status)
      ? "warning"
      : ["failed", "rejected"].includes(status)
        ? "danger"
        : ["processing", "receiving", "sealed"].includes(status)
          ? "primary"
          : "neutral";
  return <Badge tone={tone}>{labels[status] || "نامشخص"}</Badge>;
}
