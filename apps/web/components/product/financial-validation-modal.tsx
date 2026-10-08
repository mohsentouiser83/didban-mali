"use client";

import { useState } from "react";
import { ShieldCheck, Check } from "@/components/ui/icons";

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
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/product-api";
import { Textarea } from "@/components/ui/textarea";

interface FinancialValidationModalProps {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onValidated: () => void;
}

export function FinancialValidationModal({
  companyId,
  open,
  onOpenChange,
  onValidated,
}: FinancialValidationModalProps) {
  const [cash, setCash] = useState("15000000000");
  const [receivables, setReceivables] = useState("32000000000");
  const [payables, setPayables] = useState("18000000000");
  const [reconciliationDiff, setReconciliationDiff] = useState("0");
  const [confirmed, setConfirmed] = useState(false);
  const [statement, setStatement] = useState(
    "تمامی ارقام نقدینگی، مطالبات و بدهی‌ها با تراز آزمایشی و دفاتر رسمی شرکت تطبیق داده شد و مورد تأیید است.",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) {
      setError("تأیید انطباق ارقام با دفاتر مالی الزامی است.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      await api(`/companies/${companyId}/onboarding/validate`, {
        method: "POST",
        body: JSON.stringify({
          cash_position_irr: cash,
          receivables_irr: receivables,
          payables_irr: payables,
          reconciliation_difference_irr: reconciliationDiff,
          opening_balance_confirmed: true,
          user_statement: statement,
        }),
      });
      onValidated();
    } catch (err: any) {
      setError(err.detail || "ثبت اعتبارسنجی با خطا مواجه شد.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl text-foreground font-sans">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <ShieldCheck className="h-5 w-5" />
            <DialogTitle className="text-lg font-bold">
              تأیید رسمی ارقام پایه مالی (Go-Live Validation)
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            مطابق اصول کنترل داخلی دیدبان مالی، پیش از شروع بهره‌برداری عملیاتی،
            مقادیر پایه نقدینگی و مطالبات باید رسماً توسط مدیر مالی تأیید شوند.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">
                موجودی نقد پایه (ریال)
              </label>
              <Input
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                className="font-mono text-left"
                placeholder="15000000000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">
                مجموع مطالبات پایه (ریال)
              </label>
              <Input
                value={receivables}
                onChange={(e) => setReceivables(e.target.value)}
                className="font-mono text-left"
                placeholder="32000000000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">
                مجموع بدهی‌های پایه (ریال)
              </label>
              <Input
                value={payables}
                onChange={(e) => setPayables(e.target.value)}
                className="font-mono text-left"
                placeholder="18000000000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">
                اختلاف مغایرت اولیه (ریال)
              </label>
              <Input
                value={reconciliationDiff}
                onChange={(e) => setReconciliationDiff(e.target.value)}
                className="font-mono text-left"
                placeholder="0"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold">
              شرح تأییدیه مدیر مالی
            </label>
            <Textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              rows={3}
              className="w-full"
              required
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/30 p-3">
            <Checkbox
              id="confirm-terms"
              checked={confirmed}
              onCheckedChange={(c) => setConfirmed(Boolean(c))}
              className="mt-0.5"
            />
            <label
              htmlFor="confirm-terms"
              className="text-xs leading-relaxed text-muted-foreground cursor-pointer"
            >
              اینجانب به عنوان مسئول مالی شرکت تأیید می‌نمایم که ارقام فوق با
              منبع مالی مورد اعتماد (نرم‌افزار حسابداری و صورتحساب‌های رسمی
              بانکی) کاملاً تطبیق دارد.
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              انصراف
            </Button>
            <Button variant="success"
              type="submit"
              size="sm"
              disabled={submitting || !confirmed}
              className="gap-1.5"
            >
              <Check className="h-4 w-4" />
              <span>{submitting ? "در حال ثبت..." : "تأیید و ثبت نهایی"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
