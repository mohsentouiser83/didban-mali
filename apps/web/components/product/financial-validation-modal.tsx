"use client";
import { ControlLabel, fieldIcon } from "@/components/ui/field-layout";
import type { api } from "@/lib/product-api";
import { Form, FormMessage } from "@/components/ui/form";

import { useId } from "react";
import { useFinancialValidation } from "./use-financial-validation";
import { Check } from "@/components/ui/icons";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

interface FinancialValidationModalProps {
  companyId: string;
  request?: typeof api;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onValidated: () => void;
}

export function FinancialValidationModal({
  companyId,
  request,
  open,
  onOpenChange,
  onValidated,
}: FinancialValidationModalProps) {
  const id = useId();
  const { cash, setCash, receivables, setReceivables, payables, setPayables, reconciliationDiff, setReconciliationDiff, confirmed, setConfirmed, statement, setStatement, submitting, error, handleSubmit } = useFinancialValidation(companyId, onValidated, request);

  return (
    <Dialog open={open} onOpenChange={value => { if (!submitting) onOpenChange(value); }}>
      <DialogContent closeDisabled={submitting} dir="rtl" className="max-w-xl text-foreground font-sans">
        <DialogHeader>
          <DialogTitle>تأیید ارقام پایه مالی</DialogTitle>
          <DialogDescription>ارقام پایه را با منبع مالی شرکت تطبیق دهید.</DialogDescription>
        </DialogHeader>

        <Form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {error && (
            <FormMessage>{error}</FormMessage>
          )}

          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <ControlLabel htmlFor={`${id}-cash`} icon={fieldIcon("موجودی نقد پایه (ریال)")}>موجودی نقد پایه (ریال)</ControlLabel>
              <Input
                id={`${id}-cash`} value={cash}
                onChange={(e) => setCash(e.target.value)}
                dir="ltr" className="text-start"
                placeholder="15000000000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <ControlLabel htmlFor={`${id}-receivables`} icon={fieldIcon("مجموع مطالبات پایه (ریال)")}>مجموع مطالبات پایه (ریال)</ControlLabel>
              <Input
                id={`${id}-receivables`} value={receivables}
                onChange={(e) => setReceivables(e.target.value)}
                dir="ltr" className="text-start"
                placeholder="32000000000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <ControlLabel htmlFor={`${id}-payables`} icon={fieldIcon("مجموع بدهی‌های پایه (ریال)")}>مجموع بدهی‌های پایه (ریال)</ControlLabel>
              <Input
                id={`${id}-payables`} value={payables}
                onChange={(e) => setPayables(e.target.value)}
                dir="ltr" className="text-start"
                placeholder="18000000000"
                required
              />
            </div>

            <div className="space-y-1.5">
              <ControlLabel htmlFor={`${id}-reconciliationDiff`} icon={fieldIcon("اختلاف مغایرت اولیه (ریال)")}>اختلاف مغایرت اولیه (ریال)</ControlLabel>
              <Input
                id={`${id}-reconciliationDiff`} value={reconciliationDiff}
                onChange={(e) => setReconciliationDiff(e.target.value)}
                dir="ltr" className="text-start"
                placeholder="0"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <ControlLabel htmlFor={`${id}-statement`} icon={fieldIcon("شرح تأییدیه مدیر مالی")}>شرح تأییدیه مدیر مالی</ControlLabel>
            <Textarea
              id={`${id}-statement`} value={statement}
              onChange={(e) => setStatement(e.target.value)}
              rows={3}
              className="w-full"
              required
            />
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/30 p-3">
            <Check className="mt-0.5 size-[18px] shrink-0 text-primary" aria-hidden="true" />
            <Checkbox
              id={`${id}-confirm-terms`}
              checked={confirmed}
              onCheckedChange={(c) => setConfirmed(Boolean(c))}
              className="mt-0.5"
            />
            <label
              htmlFor={`${id}-confirm-terms`}
              className="text-xs leading-relaxed text-muted-foreground cursor-pointer"
            >
              اینجانب به عنوان مسئول مالی شرکت تأیید می‌نمایم که ارقام فوق با
              منبع مالی مورد اعتماد (نرم‌افزار حسابداری و صورتحساب‌های رسمی
              بانکی) کاملاً تطبیق دارد.
            </label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              انصراف
            </Button>
            <Button variant="success"
              type="submit"
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
