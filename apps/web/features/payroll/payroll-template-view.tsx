"use client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusMessage } from "@/components/ui/states";
import { FormMessage } from "@/components/ui/field";
export function PayrollTemplateView({
  employees,
  selectionLabel,
  more,
  loading,
  canAdd,
  canSelectLoaded,
  canDownload,
  error,
  onClose,
  onMore,
  onToggle,
  onSelectLoaded,
  onDownload,
}: {
  employees: { id: string; label: string; selected: boolean }[];
  selectionLabel: string;
  more: boolean;
  loading: boolean;
  canAdd: boolean;
  canSelectLoaded: boolean;
  canDownload: boolean;
  error?: string;
  onClose: () => void;
  onMore: () => void;
  onToggle: (id: string, selected: boolean) => void;
  onSelectLoaded: () => void;
  onDownload: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="کارکنان قالب کارکرد"
    >
      <div className="space-y-4">
        <StatusMessage>
          فقط کارکنان انتخاب‌شده وارد قالب می‌شوند؛ حداکثر ۱۰۰۰ کارمند در هر
          فایل.
        </StatusMessage>
        <p role="status">{selectionLabel}</p>
        <Button
          variant="secondary"
          onClick={onSelectLoaded}
          disabled={!canSelectLoaded}
        >
          انتخاب کارکنان بارگذاری‌شده
        </Button>
        <div className="space-y-2">
          {employees.map((e) => (
            <Checkbox
              key={e.id}
              id={`template-${e.id}`}
              label={e.label}
              checked={e.selected}
              disabled={!e.selected && !canAdd}
              onCheckedChange={(v) => onToggle(e.id, v)}
            />
          ))}
        </div>
        {more ? (
          <Button variant="ghost" disabled={loading} onClick={onMore}>
            {loading ? "در حال دریافت…" : "کارکنان بیشتر"}
          </Button>
        ) : null}
        <FormMessage>{error}</FormMessage>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button onClick={onDownload} disabled={!canDownload}>
            دریافت قالب انتخاب‌شده
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
