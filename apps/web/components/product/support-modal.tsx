"use client";
import { Form, FormMessage } from "@/components/ui/form";

import { useId } from "react";
import { LifeBuoy, Send } from "@/components/ui/icons";
import { useSupportTicket } from "./use-support-ticket";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectField, SelectOption } from "./select-field";

interface SupportModalProps {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportModal({
  companyId,
  open,
  onOpenChange,
}: SupportModalProps) {
  const id = useId();
  const { category, setCategory, subject, setSubject, description, setDescription, submitting, success, error, handleSubmit, close, pathname } = useSupportTicket(companyId, onOpenChange);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent dir="rtl" className="max-w-lg text-foreground font-sans">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <LifeBuoy className="h-5 w-5" />
            <DialogTitle className="text-lg font-bold">
              پشتیبانی و ارتباط با تیم مهندسی
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            درخواست‌های شما با اولویت‌بندی عملیاتی در تیم پشتیبانی بررسی می‌شود.
            اطلاعات حساس مالی شرکت به‌صورت خودکار ارسال نمی‌گردد.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-4"><FormMessage variant="success">درخواست شما ثبت شد.</FormMessage><Button onClick={() => close(false)}>بستن</Button></div>
        ) : (
          <Form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {error && (
              <FormMessage>{error}</FormMessage>
            )}

            <div className="space-y-1.5">
              <label htmlFor={`${id}-priority`} className="text-xs font-semibold">
                سطح اولویت درخواست
              </label>
              <SelectField
                id={`${id}-priority`}
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full"
              >
                <SelectOption value="P3_NORMAL">
                  P3 — عادی (پرسش درباره عملکرد، گزارش خطا یا کندی جزئی)
                </SelectOption>
                <SelectOption value="P2_HIGH">
                  P2 — مهم (خطا در واردسازی فایل یا انطباق بانکی)
                </SelectOption>
                <SelectOption value="P1_CRITICAL">
                  P1 — بحرانی (قطعی سرویس یا مغایرت اساسی در ارقام محاسباتی)
                </SelectOption>
                <SelectOption value="P4_QUESTION">
                  P4 — سوال عمومی / پیشنهاد بهبود فرآیند
                </SelectOption>
              </SelectField>
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`${id}-subject`} className="text-xs font-semibold">موضوع درخواست</label>
              <Input
                id={`${id}-subject`}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="خلاصه مشکل یا سوال خود را بنویسید"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor={`${id}-description`} className="text-xs font-semibold">شرح کامل مشکل</label>
              <Textarea
                id={`${id}-description`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full"
                placeholder="توضیح دهید در کدام بخش چه رفتاری مشاهده شد..."
                required
              />
            </div>

            <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground font-mono">
              بستر ارسالی: {pathname} | نسخه: سامانه پایدار v1.0
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => close(false)}
              >
                انصراف
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{submitting ? "در حال ارسال..." : "ارسال درخواست"}</span>
              </Button>
            </DialogFooter>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
