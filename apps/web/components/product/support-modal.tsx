"use client";

import { useState } from "react";
import { LifeBuoy, Send, CheckCircle2 } from "lucide-react";
import { usePathname } from "next/navigation";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/product-api";

interface SupportModalProps {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportModal({ companyId, open, onOpenChange }: SupportModalProps) {
  const pathname = usePathname();
  const [category, setCategory] = useState<"P1_CRITICAL" | "P2_HIGH" | "P3_NORMAL" | "P4_QUESTION">("P3_NORMAL");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api(`/companies/${companyId}/support/tickets`, {
        method: "POST",
        body: JSON.stringify({
          category,
          subject,
          description,
          current_route: pathname,
          safe_diagnostic_json: {
            url: pathname,
            viewport: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "unknown",
            client_time: new Date().toISOString(),
          },
        }),
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setSubject("");
        setDescription("");
        onOpenChange(false);
      }, 2000);
    } catch (err: any) {
      setError(err.detail || "ارسال تیکت با خطا مواجه شد.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg text-foreground font-sans">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <LifeBuoy className="h-5 w-5" />
            <DialogTitle className="text-lg font-bold">پشتیبانی و ارتباط با تیم مهندسی</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            درخواست‌های شما با اولویت‌بندی عملیاتی در تیم پشتیبانی بررسی می‌شود. اطلاعات حساس مالی شرکت به‌صورت خودکار ارسال نمی‌گردد.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 animate-bounce" />
            <h4 className="font-bold text-base text-foreground">تیکت شما با موفقیت ثبت شد</h4>
            <p className="text-xs text-muted-foreground">همکاران ما در اسرع وقت پاسخ را ارسال خواهند کرد.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive font-medium">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">سطح اولویت درخواست</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="P3_NORMAL">P3 — عادی (پرسش درباره عملکرد، گزارش خطا یا کندی جزئی)</option>
                <option value="P2_HIGH">P2 — مهم (خطا در واردسازی فایل یا انطباق بانکی)</option>
                <option value="P1_CRITICAL">P1 — بحرانی (قطعی سرویس یا مغایرت اساسی در ارقام محاسباتی)</option>
                <option value="P4_QUESTION">P4 — سوال عمومی / پیشنهاد بهبود فرآیند</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">موضوع درخواست</label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="خلاصه مشکل یا سوال خود را بنویسید"
                className="text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">شرح کامل مشکل</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="توضیح دهید در کدام بخش چه رفتاری مشاهده شد..."
                required
              />
            </div>

            <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground font-mono">
              بستر ارسالی: {pathname} | نسخه: سامانه پایدار v1.0
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                انصراف
              </Button>
              <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
                <Send className="h-3.5 w-3.5" />
                <span>{submitting ? "در حال ارسال..." : "ارسال درخواست"}</span>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
