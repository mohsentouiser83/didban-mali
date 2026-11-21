"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function SaveTemplateDialog({
  open,
  onOpenChange,
  onSave,
  initialName = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
  initialName?: string;
}) {
  const [name, setName] = useState(initialName);

  function handleSave() {
    if (!name.trim()) return;
    onSave(name.trim());
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
            ذخیره قالب
          </Button>
        </div>
      }
    >
      <div className="py-2">
        <Field id="template-name-input" label="نام قالب گزارش">
          <Input
            id="template-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً: داشبورد هفتگی فروش و مطالبات"
            required
          />
        </Field>
      </div>
    </Dialog>
  );
}
