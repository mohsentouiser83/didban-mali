"use client";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { SparkleIcon } from "@phosphor-icons/react";
import { useState } from "react";

const SUGGESTED_PROMPTS = [
  "گزارش جامع فروش فصلی، روند ماهانه و ۵ مشتری برتر",
  "تحلیل صورت سود و زیان، ترکیب هزینه‌ها و حاشیه سود",
  "داشبورد نقدینگی، مانده بانک‌ها و چک‌های صیادی در جریان",
  "بررسی مطالبات معوق، فاکتورهای سررسیدگذشته و چک‌های برگشتی",
];

export function AiPromptDialog({
  open,
  onOpenChange,
  onGenerate,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (prompt: string) => void;
  busy?: boolean;
}) {
  const [prompt, setPrompt] = useState("");

  function handleSubmit() {
    if (!prompt.trim() || busy) return;
    onGenerate(prompt.trim());
    onOpenChange(false);
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="تولید هوشمند داشبورد با هوش مصنوعی"
      description="توضیح دهید چه ابعاد، شاخص‌ها یا نمودارهایی در این گزارش بررسی شوند تا به صورت خودکار برای شما چیده شود."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!prompt.trim() || busy}
            busy={busy}
            className="gap-1.5"
          >
            <SparkleIcon size={16} />
            طراحی و تولید گزارش
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <Field id="ai-prompt-input" label="درخواست شما" required>
          <Textarea
            id="ai-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="مثلاً: یک داشبورد کامل فروش فصلی با روند ماهانه، بدهکاران عمده و فاکتورهای معوق بساز"
            className="h-28 w-full rounded-control border border-border bg-surface p-3 text-sm text-foreground transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            dir="rtl"
          />
        </Field>

        <div>
          <span className="text-xs font-medium text-muted">پیشنهادهای آماده:</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTED_PROMPTS.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPrompt(sample)}
                className="rounded-control border border-border/80 bg-neutral-soft/50 px-2.5 py-1 text-right text-xs text-secondary transition-all hover:scale-101 hover:border-primary/40 hover:bg-soft-accent hover:text-primary active:scale-95"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
