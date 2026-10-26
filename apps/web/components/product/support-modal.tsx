"use client";
import { ControlLabel, DetailField, DetailGroup, fieldIcon } from "@/components/ui/field-layout";
import type { api } from "@/lib/product-api";
import { Form, FormMessage } from "@/components/ui/form";

import { useId } from "react";
import { Send } from "@/components/ui/icons";
import { useSupportTicket } from "./use-support-ticket";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SelectField, SelectOption } from "./select-field";

interface SupportModalProps {
  companyId: string;
  request?: typeof api;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportModal({
  companyId,
  request,
  open,
  onOpenChange,
}: SupportModalProps) {
  const id = useId();
  const { category, setCategory, subject, setSubject, description, setDescription, submitting, success, error, handleSubmit, close, pathname } = useSupportTicket(companyId, onOpenChange, request);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent closeDisabled={submitting} dir="rtl" className="max-w-lg text-foreground font-sans">
        <DialogHeader>
          <DialogTitle>پشتیبانی</DialogTitle>
          <DialogDescription>اطلاعات حساس مالی خودکار ارسال نمی‌شود.</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 py-4"><FormMessage variant="success">درخواست شما ثبت شد.</FormMessage><Button onClick={() => close(false)}>بستن</Button></div>
        ) : (
          <Form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {error && (
              <FormMessage>{error}</FormMessage>
            )}

            <div className="space-y-1.5">
              <ControlLabel htmlFor={`${id}-priority`} icon={fieldIcon("سطح اولویت درخواست")}>سطح اولویت درخواست</ControlLabel>
              <SelectField
                id={`${id}-priority`}
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="w-full"
              >
                <SelectOption value="P3_NORMAL">
                  P3 — عادی
                </SelectOption>
                <SelectOption value="P2_HIGH">
                  P2 — مهم
                </SelectOption>
                <SelectOption value="P1_CRITICAL">
                  P1 — بحرانی
                </SelectOption>
                <SelectOption value="P4_QUESTION">
                  P4 — پرسش و پیشنهاد
                </SelectOption>
              </SelectField>
            </div>

            <div className="space-y-1.5">
              <ControlLabel htmlFor={`${id}-subject`} icon={fieldIcon("موضوع درخواست")}>موضوع درخواست</ControlLabel>
              <Input
                id={`${id}-subject`}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="خلاصه مشکل یا سوال خود را بنویسید"
                required
              />
            </div>

            <div className="space-y-1.5">
              <ControlLabel htmlFor={`${id}-description`} icon={fieldIcon("شرح کامل مشکل")}>شرح کامل مشکل</ControlLabel>
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

            <DetailGroup><DetailField label="صفحه مرتبط" icon={fieldIcon("آدرس صفحه")}><bdi dir="ltr">{pathname}</bdi></DetailField></DetailGroup>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => close(false)}
              >
                انصراف
              </Button>
              <Button
                type="submit"
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
