"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export function SaveTemplateDialog({
  open,
  onOpenChange,
  onSave,
  initialName = "",
  defaultIsDashboard = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, isDashboard: boolean) => void;
  initialName?: string;
  defaultIsDashboard?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [isDashboard, setIsDashboard] = useState(defaultIsDashboard);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(initialName);
      setIsDashboard(defaultIsDashboard);
    }
  }

  function handleSave() {
    if (!name.trim()) return;
    onSave(name.trim(), isDashboard);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="ذخیره قالب گزارش"
      description="با ذخیره این قالب، در تمام دوره‌های مالی آتی می‌توانید با یک کلیک این گزارش کامل را بازخوانی کنید."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!name.trim()}>
            {isDashboard ? "ذخیره و تبدیل به داشبورد" : "ذخیره قالب"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <Field id="template-name-input" label="نام قالب گزارش">
          <Input
            id="template-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً: داشبورد جامع فروش و مطالبات"
            required
          />
        </Field>

        <div className="flex items-center justify-between rounded-panel border border-border bg-canvas/60 p-3.5">
          <div className="space-y-0.5">
            <span className="text-sm font-medium text-foreground">
              تنظیم به‌عنوان داشبورد اصلی شرکت
            </span>
            <p className="text-xs text-muted">
              این گزارش بلافاصله در صفحه نخست (داشبورد) شرکت نمایش داده خواهد شد.
            </p>
          </div>
          <Switch
            label="تنظیم به‌عنوان داشبورد اصلی"
            checked={isDashboard}
            onCheckedChange={setIsDashboard}
          />
        </div>
      </div>
    </Dialog>
  );
}
