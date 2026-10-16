"use client";
import { Form, FormMessage } from "@/components/ui/form";

import { useId } from "react";
import { useFinancialValidation } from "./use-financial-validation";
import { ShieldCheck, Check } from "@/components/ui/icons";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  const id = useId();
  const { cash, setCash, receivables, setReceivables, payables, setPayables, reconciliationDiff, setReconciliationDiff, confirmed, setConfirmed, statement, setStatement, submitting, error, handleSubmit } = useFinancialValidation(companyId, onValidated);

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

        <Form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <FormMessage>{error}</FormMessage>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={`${id}-cash`} className="text-xs font-semibold">
                موجودی نقد پایه (ریال)
              </label>
              <Input
                id={`${id}-cash`} value={cash}
                onChange={(e) => setCash(e.target.value)}
                dir="ltr" className="font-mono text-start"
                placeholder="15000000000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`${id}-receivables`} className="text-xs font-semibold">
                مجموع مطالبات پایه (ریال)
              </label>
              <Input
                id={`${id}-receivables`} value={receivables}
                onChange={(e) => setReceivables(e.target.value)}
                dir="ltr" className="font-mono text-start"
                placeholder="32000000000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`${id}-payables`} className="text-xs font-semibold">
                مجموع بدهی‌های پایه (ریال)
              </label>
              <Input
                id={`${id}-payables`} value={payables}
                onChange={(e) => setPayables(e.target.value)}
                dir="ltr" className="font-mono text-start"
                placeholder="18000000000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`${id}-reconciliationDiff`} className="text-xs font-semibold">
                اختلاف مغایرت اولیه (ریال)
              </label>
              <Input
                id={`${id}-reconciliationDiff`} value={reconciliationDiff}
                onChange={(e) => setReconciliationDiff(e.target.value)}
                dir="ltr" className="font-mono text-start"
                placeholder="0"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor={`${id}-statement`} className="text-xs font-semibold">
              شرح تأییدیه مدیر مالی
            </label>
            <Textarea
              id={`${id}-statement`} value={statement}
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
        </Form>
      </DialogContent>
    </Dialog>
  );
}
