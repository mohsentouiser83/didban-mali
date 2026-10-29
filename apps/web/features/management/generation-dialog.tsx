import { AppIcon } from "@/components/ui/app-icon";
import { useState } from "react";
import { CalendarDays, FileSpreadsheet } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FilePicker } from "@/components/ui/file-picker";
import { FormMessage } from "@/components/ui/field";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";

export function GenerationDialog({
  open,
  onOpen,
  busy,
  parsing,
  error,
  parseError,
  templateName,
  templateChoice,
  templateOptions,
  onTemplateChoice,
  onFile,
  onSubmit,
  company,
  report,
}: {
  open: boolean;
  onOpen: (open: boolean) => void;
  busy: boolean;
  parsing: boolean;
  error: string | null;
  parseError: string | null;
  templateName: string;
  templateChoice: string;
  templateOptions: { value: string; label: string }[];
  onTemplateChoice: (choice: string) => void;
  onFile: (file: File) => void;
  onSubmit: (data: FormData) => void;
  company: string;
  report?: string;
}) {
  const [basis, setBasis] = useState("auto");
  return (
    <Dialog
      icon="ClipboardList"
      title="تهیه گزارش تحلیلی"
      open={open}
      onOpenChange={onOpen}
      busy={busy || parsing}
    >
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(new FormData(e.currentTarget));
        }}
        className="space-y-5"
      >
        <div className="space-y-2">
          <label htmlFor="management-start" className="flex items-center gap-2">
            <CalendarDays size={17} aria-hidden />
            از تاریخ
          </label>
          <PersianDatePicker
            id="management-start"
            name="starts_on"
            label="از تاریخ"
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="management-cutoff"
            className="flex items-center gap-2"
          >
            <CalendarDays size={17} aria-hidden />
            تا تاریخ
          </label>
          <PersianDatePicker
            id="management-cutoff"
            name="as_of_date"
            label="تا تاریخ"
          />
        </div>
        <p className="text-sm text-muted">
          تاریخ خالی، بازه نسخه داده انتخاب‌شده را حفظ می‌کند.
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-2" htmlFor="management-basis">
            <AppIcon name="ClipboardList" className="text-primary" />
            مبنای صورت‌های مالی
          </label>
          <Select
            id="management-basis"
            name="statement_basis"
            label="مبنای صورت‌های مالی"
            value={basis}
            onValueChange={setBasis}
            options={[
              { value: "auto", label: "بر اساس منابع موجود" },
              { value: "ledger", label: "دفتر حسابداری" },
              { value: "trial_balance", label: "تراز آزمایشی" },
            ]}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="management-template"
            className="flex items-center gap-2"
          >
            <FileSpreadsheet size={17} aria-hidden />
            قالب صورت‌های مالی
          </label>
          <Select
            id="management-template"
            label="قالب صورت‌های مالی"
            value={templateChoice}
            onValueChange={onTemplateChoice}
            options={templateOptions}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <FilePicker
            label={parsing ? "در حال بررسی قالب…" : "انتخاب قالب Excel"}
            accept=".xlsx"
            disabled={busy || parsing}
            onFiles={(files) => {
              if (files[0]) onFile(files[0]);
            }}
            multiple={false}
            compact
          />
          <Button asChild variant="ghost">
            <a
              href={
                report
                  ? `/api/v1/companies/${company}/reports/${report}/statement-template`
                  : `/api/v1/companies/${company}/statement-templates/example`
              }
            >
              دانلود قالب نگاشت
            </a>
          </Button>
        </div>
        {templateName ? (
          <p className="break-all text-sm text-muted">{templateName}</p>
        ) : null}
        <FormMessage>{parseError}</FormMessage>
        <FormMessage>{error}</FormMessage>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy || parsing}>
            <AppIcon name="Plus" />
            {busy ? "در حال تهیه گزارش…" : "تهیه نسخه جدید"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || parsing}
            onClick={() => onOpen(false)}
          >
            <AppIcon name="X" />
            انصراف
          </Button>
        </div>
      </Form>
    </Dialog>
  );
}
