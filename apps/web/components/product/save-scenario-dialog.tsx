"use client";

import { useState } from "react";
import { BookmarkPlus, Loader2, Star } from "lucide-react";
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

import { api } from "@/lib/product-api";
import type {
  SavedScenarioCreateRequest,
  SavedScenarioItem,
  SimulationParametersRequest,
} from "@/lib/product-types";

interface SaveScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  parameters: SimulationParametersRequest;
  onScenarioSaved: (scenario: SavedScenarioItem) => void;
}

export function SaveScenarioDialog({
  open,
  onOpenChange,
  companyId,
  parameters,
  onScenarioSaved,
}: SaveScenarioDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("لطفاً نام سناریو را وارد کنید.");
      return;
    }

    setSaving(true);
    try {
      const payload: SavedScenarioCreateRequest = {
        name: name.trim(),
        description: description.trim() || null,
        is_favorite: isFavorite,
        parameters,
      };

      const saved = await api<SavedScenarioItem>(`/companies/${companyId}/simulation/scenarios`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      toast.success(`سناریوی «${saved.name}» با موفقیت ذخیره شد.`);
      onScenarioSaved(saved);
      onOpenChange(false);
      setName("");
      setDescription("");
      setIsFavorite(false);
    } catch {
      toast.error("خطا در ذخیره سناریو");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <BookmarkPlus className="size-5 text-primary" />
              ذخیره سناریوی شبیه‌سازی مالی
            </DialogTitle>
            <DialogDescription className="text-xs">
              این سناریو به همراه تمام متغیرهای اهرم‌ها و نتایج کش‌شده در پرونده شرکت ذخیره خواهد شد.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label htmlFor="scenario-name" className="block text-xs font-semibold mb-1.5">
                نام سناریو <span className="text-red-500">*</span>
              </label>
              <Input
                id="scenario-name"
                placeholder="مثال: برنامه استخدام واحد مارکتینگ پاییز ۱۴۰۳"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
                className="text-xs"
              />
            </div>

            <div>
              <label htmlFor="scenario-desc" className="block text-xs font-semibold mb-1.5">
                توضیحات و اهداف استراتژیک (اختیاری)
              </label>
              <Input
                id="scenario-desc"
                placeholder="مثال: سنجش اثر افزایش ۲ نفر و تسریع وصول بر جریان نقد پاییز"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsFavorite(!isFavorite)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  isFavorite
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 font-semibold"
                    : "border-[var(--ds-border)] text-[var(--ds-muted-fg)] hover:bg-[var(--ds-muted-bg)]"
                }`}
              >
                <Star
                  className={`size-3.5 ${
                    isFavorite ? "fill-amber-500 text-amber-500" : "text-muted-foreground"
                  }`}
                />
                <span>افزودن به سناریوهای ستاره‌دار</span>
              </button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="text-xs"
            >
              انصراف
            </Button>
            <Button type="submit" size="sm" disabled={saving} className="text-xs gap-1.5">
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>در حال ذخیره...</span>
                </>
              ) : (
                <span>ذخیره سناریو</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
