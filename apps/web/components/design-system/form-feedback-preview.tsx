"use client";

import { useState } from "react";
import { Form, FormMessage } from "@/components/ui/form";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { notify } from "@/components/ui/sonner";

export function FormFeedbackPreview() {
  const [date, setDate] = useState("");
  const [saved, setSaved] = useState(false);
  return <section id="form-feedback" aria-label="نمونه پیام و اعتبارسنجی" className="space-y-5">
    <h2 className="text-[22px] font-medium">اعلان و اعتبارسنجی فرم</h2>
    <div className="grid min-w-0 gap-6 md:grid-cols-2">
      <Form onInputCapture={() => setSaved(false)} className="space-y-4 rounded-[var(--ds-card-radius)] border border-border bg-card p-4" onSubmit={(event) => { event.preventDefault(); setSaved(true); }}>
        <div className="space-y-2"><label htmlFor="feedback-email" className="text-sm">ایمیل نمونه</label><Input id="feedback-email" type="email" required aria-describedby="feedback-email-hint" /><FieldDescription id="feedback-email-hint">این فرم داده‌ای ارسال نمی‌کند.</FieldDescription></div>
        <div className="space-y-2"><label htmlFor="feedback-date" className="text-sm">تاریخ نمونه</label><PersianDatePicker id="feedback-date" value={date} onValueChange={(value) => { setDate(value); setSaved(false); }} required min="2026-03-21" /></div>
        <Button type="submit">بررسی فرم نمونه</Button>
        {saved && <FormMessage variant="success">اطلاعات نمونه معتبر است.</FormMessage>}
      </Form>
      <div className="space-y-4"><FormMessage variant="info">نمونه نمایشی پیام فرم</FormMessage><div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => notify.success("نمونه اعلان موفقیت")}>اعلان موفقیت</Button><Button variant="outline" onClick={() => notify.error("نمونه اعلان خطا")}>اعلان خطا</Button><Button variant="outline" onClick={() => notify.info("نمونه اعلان اطلاع‌رسانی")}>اعلان اطلاع‌رسانی</Button></div></div>
    </div>
  </section>;
}
