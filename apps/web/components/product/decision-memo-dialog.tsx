"use client";

import { useState } from "react";
import { Download, FileText, Loader2 } from "@/components/ui/icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import type {
  DecisionMemoExportRequest,
  SimulationParametersRequest,
} from "@/lib/product-types";
import { Textarea } from "@/components/ui/textarea";

interface DecisionMemoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  parameters: SimulationParametersRequest;
  scenarioTitle?: string;
}

export function DecisionMemoDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  parameters,
  scenarioTitle = "سناریوی شبیه‌سازی‌شده جاری",
}: DecisionMemoDialogProps) {
  const [subject, setSubject] = useState(
    "ارزیابی اثرات مالی تصمیمات بر تاب‌آوری خزانه",
  );
  const [preparedFor, setPreparedFor] = useState(
    "اعضای محترم هیئت مدیره و مدیرعامل",
  );
  const [advisorNotes, setAdvisorNotes] = useState(
    "سناریوی حاضر با هدف بهینه‌سازی دوره وصول و مدیریت نقدینگی تهیه شده است.",
  );
  const [downloading, setDownloading] = useState(false);

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    setDownloading(true);

    try {
      const payload: DecisionMemoExportRequest = {
        custom_params: parameters,
        scenario_title: scenarioTitle,
        prepared_for: preparedFor.trim() || "اعضای محترم هیئت مدیره",
        memo_subject: subject.trim() || "ارزیابی اثرات مالی تصمیمات",
        advisor_notes: advisorNotes.trim() || null,
      };

      const res = await fetch(
        `/api/v1/companies/${companyId}/simulation/memo/pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        throw new Error("خطا در صدور سند PDF یادداشت تصمیم‌گیری");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `یادداشت_تصمیم_گیری_${companyName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success("یادداشت تصمیم‌گیری مالی با موفقیت صادر و دانلود شد.");
      onOpenChange(false);
    } catch {
      toast.error("خطا در ایجاد و دریافت فایل PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleExport}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <FileText className="size-5 text-primary" />
              صدور یادداشت تصمیم‌گیری مالی (CFO Decision Memorandum)
            </DialogTitle>
            <DialogDescription className="text-xs">
              تولید گزارش رسمی چاپی و قابل امضا جهت ارائه مستقیم به مدیرعامل و
              اعضای هیئت مدیره.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label
                htmlFor="memo-title"
                className="block text-xs font-semibold mb-1.5"
              >
                موضوع
              </label>
              <Input
                id="memo-title"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>

            <div>
              <label
                htmlFor="memo-recipient"
                className="block text-xs font-semibold mb-1.5"
              >
                مخاطب
              </label>
              <Input
                id="memo-recipient"
                value={preparedFor}
                onChange={(e) => setPreparedFor(e.target.value)}
                required
              />
            </div>

            <div>
              <label
                htmlFor="memo-notes"
                className="block text-xs font-semibold mb-1.5"
              >
                یادداشت تکمیلی
              </label>
              <Textarea
                id="memo-notes"
                value={advisorNotes}
                onChange={(e) => setAdvisorNotes(e.target.value)}
                rows={3}
                className="w-full"
                placeholder="توضیحات اختیاری درباره مفروضات یا هشدارهای اجرایی..."
              />
            </div>

            <div className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-muted-bg)]/50 p-3 text-[11px] text-[var(--ds-muted-fg)] leading-relaxed">
              این سند شامل سربرگ رسمی، باکس ارزیابی و حکم مدیریتی، جدول ماتریس
              مقایسه شاخص‌های کلیدی، ایستگاه‌های ۱۳ هفته‌ای جریان نقد خزانه و
              بلوک امضای تصویب هیئت‌مدیره خواهد بود.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={downloading}
              className=""
            >
              انصراف
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={downloading}
              className="gap-1.5"
            >
              {downloading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>در حال تولید PDF...</span>
                </>
              ) : (
                <>
                  <Download className="size-3.5" />
                  <span>دانلود فایل PDF رسمی</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
