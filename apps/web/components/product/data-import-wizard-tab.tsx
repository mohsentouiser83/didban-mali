"use client";

import { useState, useRef, useEffect, DragEvent, FormEvent, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { ProductCard } from "./product-card";
import { SelectField, SelectOption } from "./select-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/product-api";
import { buildTransforms, fieldLabels, isRequiredField, targetFields } from "@/lib/import-mapping";
import type {
  Company,
  ImportBatch,
  ImportPreview,
  IssuesPage,
  MappingResponse,
  ValidationResponse,
  ImportIssue,
  MappingTemplateResponse,
} from "@/lib/product-types";
import {
  BookOpen,
  Landmark,
  Receipt,
  UploadCloud,
  FileCheck2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  Coins,
  Calendar,
  Layers,
  FileSpreadsheet,
} from "lucide-react";

interface DataImportWizardTabProps {
  company: Company;
  initialSourceKind?: "accounting" | "bank" | "sales";
  onFinishImport?: () => void;
  onNavigateTab?: (tab: string) => void;
}

const sourceLabels: Record<string, string> = {
  accounting: "حسابداری",
  bank: "گردش بانکی",
  sales: "فروش و صورتحساب",
};

const sourceOptions = [
  {
    kind: "accounting" as const,
    title: "حسابداری",
    desc: "اسناد و گردش حساب‌های دفتر کل شرکت",
    defaultLabel: "اسناد حسابداری دفتر کل",
    icon: BookOpen,
  },
  {
    kind: "bank" as const,
    title: "گردش بانکی",
    desc: "صورتحساب و تراکنش‌های حساب‌های بانکی شرکت",
    defaultLabel: "صورتحساب گردش بانک",
    icon: Landmark,
  },
  {
    kind: "sales" as const,
    title: "فروش و صورتحساب",
    desc: "فاکتورها، مشتریان و وضعیت وصول مطالبات",
    defaultLabel: "فاکتورهای فروش و درآمد",
    icon: Receipt,
  },
];

const stepLabels = [
  "۱. انتخاب منبع",
  "۲. بارگذاری فایل",
  "۳. ساختار و پیش‌نمایش",
  "۴. تطبیق ستون‌ها",
  "۵. کنترل کیفیت",
  "۶. تأیید و پردازش",
  "۷. نتیجه نهایی",
];

export function DataImportWizardTab({
  company,
  initialSourceKind = "accounting",
  onFinishImport,
  onNavigateTab,
}: DataImportWizardTabProps) {
  // Wizard state: 1 to 7
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [sourceKind, setSourceKind] = useState<"accounting" | "bank" | "sales">(initialSourceKind);
  const [sourceLabel, setSourceLabel] = useState(
    sourceOptions.find((s) => s.kind === initialSourceKind)?.defaultLabel || "دفتر کل حسابداری"
  );

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [activeBatch, setActiveBatch] = useState<ImportBatch | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview & Mapping state
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [headerRow, setHeaderRow] = useState<number>(1);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [currencyUnit, setCurrencyUnit] = useState<"rial" | "toman">("rial");
  const [calendar, setCalendar] = useState<"jalali" | "gregorian">("jalali");
  const [templateName, setTemplateName] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [appliedTemplateName, setAppliedTemplateName] = useState<string | null>(null);

  // Quality / Validation state
  const [validationData, setValidationData] = useState<ValidationResponse | null>(null);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [validationBusy, setValidationBusy] = useState(false);

  // Commit & Result state
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitProgress, setCommitProgress] = useState(10);
  const [progressMessage, setProgressMessage] = useState("در حال آماده‌سازی پردازش…");
  const [generalError, setGeneralError] = useState("");
  const [successNotice, setSuccessNotice] = useState("");

  // Sync initialSourceKind if prop changes
  useEffect(() => {
    if (initialSourceKind) {
      setSourceKind(initialSourceKind);
      const opt = sourceOptions.find((s) => s.kind === initialSourceKind);
      if (opt) setSourceLabel(opt.defaultLabel);
    }
  }, [initialSourceKind]);

  // Handle file selection
  function handleFile(file: File | undefined) {
    setGeneralError("");
    setDuplicateWarning(null);
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["csv", "xlsx"].includes(ext)) {
      setGeneralError("تنها فایل‌های با پسوند XLSX یا CSV پشتیبانی می‌شوند.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setGeneralError("حجم فایل فراتر از سقف مجاز (۵۰ مگابایت) است.");
      return;
    }
    setSelectedFile(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  // Upload file to backend
  async function performUpload() {
    if (!selectedFile) {
      setGeneralError("لطفاً ابتدا فایلی را برای بارگذاری انتخاب فرمایید.");
      return;
    }
    setUploadBusy(true);
    setGeneralError("");
    setDuplicateWarning(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("source_kind", sourceKind);
    formData.append("source_label", sourceLabel.trim());

    try {
      const batchRes = await api<ImportBatch>(`/companies/${company.id}/imports/uploads`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: formData,
      });

      setActiveBatch(batchRes);

      if (batchRes.duplicate_detected) {
        setDuplicateWarning(
          "هشدار: فایلی با این محتوا (کد امنیتی یکسان) قبلاً در سامانه ثبت شده است. جهت جلوگیری از تکرار اسناد، فرایند را با دقت بررسی فرمایید."
        );
      }

      // Fetch preview
      const previewRes = await api<ImportPreview>(
        `/companies/${company.id}/imports/${batchRes.id}/preview`
      );
      setPreview(previewRes);
      setHeaderRow(previewRes.header_row);
      setSelectedSheet(previewRes.selected_sheet || previewRes.sheets[0] || "");

      // Auto-suggest mapping
      const initialMap: Record<string, string> = {};
      previewRes.suggestions.forEach((s) => {
        initialMap[s.target_field] = s.source_column;
      });
      setMapping(initialMap);

      // Check if matching template exists
      if (previewRes.matching_profile) {
        const mp = previewRes.matching_profile;
        setAppliedTemplateName(mp.name);
        setMapping(mp.mapping);
        setCurrencyUnit(mp.currency_unit);
        setCalendar(mp.calendar);
        if (mp.header_row) setHeaderRow(mp.header_row);
      }

      setCurrentStep(3);
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : "خطا در بارگذاری و اسکن فایل.");
    } finally {
      setUploadBusy(false);
    }
  }

  // Reload preview when sheet or headerRow changes
  async function reloadPreview(newHeaderRow?: number, newSheet?: string) {
    if (!activeBatch) return;
    const hr = newHeaderRow ?? headerRow;
    const sh = newSheet ?? selectedSheet;
    try {
      let url = `/companies/${company.id}/imports/${activeBatch.id}/preview?header_row=${hr}`;
      if (sh) url += `&sheet_name=${encodeURIComponent(sh)}`;
      const res = await api<ImportPreview>(url);
      setPreview(res);
      setHeaderRow(res.header_row);
      setSelectedSheet(res.selected_sheet);
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : "خطا در خواندن شیت یا ردیف سرستون.");
    }
  }

  // Apply matched template
  function applyTemplate() {
    if (preview?.matching_profile) {
      const mp = preview.matching_profile;
      setMapping(mp.mapping);
      setCurrencyUnit(mp.currency_unit);
      setCalendar(mp.calendar);
      if (mp.header_row) {
        setHeaderRow(mp.header_row);
        void reloadPreview(mp.header_row);
      }
      setSuccessNotice(`الگوی «${mp.name}» با موفقیت اعمال گردید.`);
    }
  }

  // Validate mapping fields before proceeding to quality
  const targetFieldList = useMemo(() => targetFields[sourceKind], [sourceKind]);
  const isMappingValid = useMemo(() => {
    if (!preview) return false;
    const reqs = preview.required_fields;
    const reqsMapped = reqs.every((r) => mapping[r] && mapping[r].trim());
    if (!reqsMapped) return false;

    if (preview.alternative_required_fields.length > 0) {
      const anyAlt = preview.alternative_required_fields.some((group) =>
        group.every((f) => mapping[f] && mapping[f].trim())
      );
      if (!anyAlt) return false;
    }
    return true;
  }, [preview, mapping]);

  // Save mapping & perform quality validation
  async function proceedToValidation() {
    if (!activeBatch || !preview || !isMappingValid) return;
    setValidationBusy(true);
    setGeneralError("");

    const cleanedMap = Object.fromEntries(
      Object.entries(mapping).filter(([, src]) => src && src.trim())
    );

    try {
      // 1. Confirm mapping
      await api<MappingResponse>(`/companies/${company.id}/imports/${activeBatch.id}/mapping`, {
        method: "PUT",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          sheet_name: selectedSheet,
          header_row: headerRow,
          mapping: cleanedMap,
          transforms: buildTransforms(cleanedMap, currencyUnit),
          currency_unit: currencyUnit,
          calendar,
          profile_name: saveAsTemplate && templateName.trim() ? templateName.trim() : null,
        }),
      });

      // 2. Run quality validation on full dataset
      const valRes = await api<ValidationResponse>(
        `/companies/${company.id}/imports/${activeBatch.id}/validate`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        }
      );
      setValidationData(valRes);

      // 3. Fetch detailed issues
      const issuesRes = await api<IssuesPage>(
        `/companies/${company.id}/imports/${activeBatch.id}/issues?limit=150`
      );
      setIssues(issuesRes.items);

      setCurrentStep(5);
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : "خطا در ثبت نگاشت و اعتبارسنجی مقادیر.");
    } finally {
      setValidationBusy(false);
    }
  }

  // Final Commit & Ingestion
  async function performCommit() {
    if (!activeBatch) return;
    setCommitBusy(true);
    setGeneralError("");
    setCommitProgress(30);
    setProgressMessage("ساختار فایل شناسایی شد. در حال نرمال‌سازی ارقام و تاریخ‌ها…");

    try {
      setTimeout(() => {
        setCommitProgress(70);
        setProgressMessage("در حال ثبت رکوردهای تاییدشده در دفاتر کانونیکال دیدبان…");
      }, 600);

      const res = await api<ImportBatch>(
        `/companies/${company.id}/imports/${activeBatch.id}/commit`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        }
      );
      setActiveBatch(res);
      setCommitProgress(100);
      setProgressMessage("پردازش با موفقیت پایان یافت.");
      setCurrentStep(7);
      if (onFinishImport) onFinishImport();
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : "خطا در پردازش و ورود نهایی به دفاتر.");
    } finally {
      setCommitBusy(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* 7-Step Horizontal Stepper */}
      <div className="p-3 rounded-2xl bg-card border border-border/80 shadow-2xs overflow-x-auto">
        <div className="flex items-center justify-between min-w-[620px] gap-2">
          {stepLabels.map((lbl, idx) => {
            const stepNum = idx + 1;
            const isActive = currentStep === stepNum;
            const isCompleted = currentStep > stepNum;

            return (
              <div
                key={stepNum}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all ${
                  isActive
                    ? "bg-primary/10 text-primary font-bold border border-primary/30"
                    : isCompleted
                    ? "text-emerald-600 dark:text-emerald-400 font-medium"
                    : "text-muted-foreground opacity-60"
                }`}
              >
                <span
                  className={`size-6 rounded-lg text-xs flex items-center justify-center shrink-0 font-bold ${
                    isCompleted
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted ? "✓" : stepNum}
                </span>
                <span className="text-xs whitespace-nowrap">{lbl}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Global Alerts */}
      {generalError && (
        <Alert variant="destructive" className="text-xs p-3.5 rounded-xl" role="alert">
          <AlertCircle className="size-4 shrink-0 me-2" />
          <span>{generalError}</span>
        </Alert>
      )}
      {duplicateWarning && (
        <Alert className="text-xs p-3.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" role="alert">
          <AlertTriangle className="size-4 shrink-0 me-2" />
          <span>{duplicateWarning}</span>
        </Alert>
      )}
      {successNotice && (
        <Alert className="text-xs p-3.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
          <CheckCircle2 className="size-4 shrink-0 me-2" />
          <span>{successNotice}</span>
        </Alert>
      )}

      {/* STEP 1: SELECT SOURCE */}
      {currentStep === 1 && (
        <ProductCard className="p-6 rounded-2xl border border-border bg-card space-y-6">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">
              گام ۱: این فایل شامل چه نوع داده‌ای است؟
            </h3>
            <p className="text-xs text-muted-foreground">
              منبع داده‌ای مورد نظر را جهت اعمال قواعد اعتبارسنجی و نگاشت مناسب انتخاب فرمایید.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {sourceOptions.map((opt) => {
              const IconComp = opt.icon;
              const isSelected = sourceKind === opt.kind;

              return (
                <div
                  key={opt.kind}
                  onClick={() => {
                    setSourceKind(opt.kind);
                    setSourceLabel(opt.defaultLabel);
                  }}
                  className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between space-y-3 ${
                    isSelected
                      ? "border-primary bg-primary/[0.04] shadow-xs"
                      : "border-border/70 hover:border-primary/40 bg-card/50"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <IconComp className="size-5" />
                      </span>
                      {isSelected && (
                        <Badge className="bg-primary text-primary-foreground text-[10px] px-2">
                          انتخاب‌شده
                        </Badge>
                      )}
                    </div>
                    <strong className="block text-sm font-bold text-foreground">{opt.title}</strong>
                    <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 max-w-md pt-2">
            <label className="text-xs font-bold text-foreground block">
              عنوان این منبع در سامانه:
            </label>
            <Input
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="مثلاً: دفتر کل دوره مالی ۱۴۰۴"
              className="text-xs h-9 rounded-xl"
            />
            <span className="text-[11px] text-muted-foreground block">
              این عنوان برای شناسایی بسته‌ها در تاریخچه و گزارش‌های آینده نمایش داده می‌شود.
            </span>
          </div>

          <div className="flex items-center justify-end pt-4 border-t border-border/60">
            <Button
              onClick={() => setCurrentStep(2)}
              className="h-9 px-5 text-xs rounded-xl gap-2 font-bold"
            >
              <span>مرحله بعد: بارگذاری فایل</span>
              <ArrowLeft className="size-4" />
            </Button>
          </div>
        </ProductCard>
      )}

      {/* STEP 2: FILE UPLOAD */}
      {currentStep === 2 && (
        <ProductCard className="p-6 rounded-2xl border border-border bg-card space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">
                گام ۲: بارگذاری فایل اکسل (XLSX) یا CSV
              </h3>
              <p className="text-xs text-muted-foreground">
                منبع انتخابی: <strong className="text-foreground">{sourceLabels[sourceKind]}</strong> ({sourceLabel})
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentStep(1)}
              className="text-xs gap-1.5 h-8 text-muted-foreground"
            >
              <ArrowRight className="size-3.5" />
              <span>تغییر منبع</span>
            </Button>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-3 ${
              dragging
                ? "border-primary bg-primary/[0.05]"
                : selectedFile
                ? "border-emerald-500/50 bg-emerald-500/[0.02]"
                : "border-border hover:border-primary/50 bg-muted/20"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            <span className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <UploadCloud className="size-6" />
            </span>

            {selectedFile ? (
              <div className="space-y-1">
                <strong className="block text-sm font-bold text-foreground" dir="ltr">
                  {selectedFile.name}
                </strong>
                <span className="text-xs text-muted-foreground block">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} مگابایت · فرمت: {selectedFile.name.split(".").pop()?.toUpperCase()}
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold block pt-1">
                  ✓ فایل آماده بارگذاری و اسکن اولیه است
                </span>
              </div>
            ) : (
              <div className="space-y-1">
                <strong className="block text-xs sm:text-sm font-bold text-foreground">
                  فایل اکسل یا CSV را بکشید و اینجا رها کنید، یا کلیک نمایید
                </strong>
                <span className="text-[11px] text-muted-foreground block">
                  فرمت‌های مجاز: XLSX و CSV · حداکثر حجم: ۵۰ مگابایت
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentStep(1)}
              className="text-xs h-9 rounded-xl gap-1.5"
            >
              <ArrowRight className="size-3.5" />
              <span>بازگشت</span>
            </Button>

            <Button
              disabled={!selectedFile || uploadBusy}
              onClick={performUpload}
              className="h-9 px-6 text-xs rounded-xl gap-2 font-bold"
            >
              {uploadBusy ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  <span>در حال دریافت و اسکن فایل…</span>
                </>
              ) : (
                <>
                  <span>بارگذاری و پیش‌نمایش ساختار</span>
                  <ArrowLeft className="size-4" />
                </>
              )}
            </Button>
          </div>
        </ProductCard>
      )}

      {/* STEP 3: STRUCTURE & PREVIEW */}
      {currentStep === 3 && preview && activeBatch && (
        <ProductCard className="p-6 rounded-2xl border border-border bg-card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div>
              <h3 className="text-base font-bold text-foreground">
                گام ۳: پیش‌نمایش و شناسایی ساختار فایل
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                فایل: <strong className="font-mono text-foreground" dir="ltr">{activeBatch.original_name}</strong> · تعداد {preview.columns.length} ستون شناسایی شد
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Sheet selector if multiple sheets */}
              {preview.sheets.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">شیت:</span>
                  <SelectField
                    value={selectedSheet}
                    onChange={(e) => {
                      setSelectedSheet(e.target.value);
                      void reloadPreview(headerRow, e.target.value);
                    }}
                    className="h-8 text-xs py-0 ps-2 pe-6 rounded-lg font-bold"
                  >
                    {preview.sheets.map((s) => (
                      <SelectOption key={s} value={s}>
                        {s}
                      </SelectOption>
                    ))}
                  </SelectField>
                </div>
              )}

              {/* Header row selector */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">ردیف سرستون:</span>
                <SelectField
                  value={String(headerRow)}
                  onChange={(e) => {
                    const row = Number(e.target.value);
                    setHeaderRow(row);
                    void reloadPreview(row);
                  }}
                  className="h-8 text-xs py-0 ps-2 pe-6 rounded-lg font-bold"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => (
                    <SelectOption key={r} value={String(r)}>
                      ردیف {r.toLocaleString("fa-IR")}
                    </SelectOption>
                  ))}
                </SelectField>
              </div>
            </div>
          </div>

          {/* First 15 Preview Rows */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-foreground block">
              پیش‌نمایش ۱۰ تا ۲۰ سطر اولیه فایل منبع:
            </span>
            <div className="rounded-xl border border-border bg-card overflow-x-auto max-h-72">
              <Table className="text-[11px] font-mono whitespace-nowrap">
                <TableHeader className="bg-muted/50 sticky top-0">
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    {preview.columns.map((col) => (
                      <TableHead key={col} className="text-start font-bold text-foreground">
                        {col}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {preview.rows.map((r) => (
                    <TableRow key={r.row_number} className="hover:bg-muted/30">
                      <TableCell className="text-center font-bold text-muted-foreground">
                        {r.row_number}
                      </TableCell>
                      {preview.columns.map((col) => (
                        <TableCell key={col} className="truncate max-w-[200px]" dir="ltr">
                          {String(r.raw[col] ?? "—")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentStep(2)}
              className="text-xs h-9 rounded-xl gap-1.5"
            >
              <ArrowRight className="size-3.5" />
              <span>انتخاب فایل دیگر</span>
            </Button>

            <Button
              onClick={() => setCurrentStep(4)}
              className="h-9 px-6 text-xs rounded-xl gap-2 font-bold"
            >
              <span>مرحله بعد: تطبیق ستون‌ها</span>
              <ArrowLeft className="size-4" />
            </Button>
          </div>
        </ProductCard>
      )}

      {/* STEP 4: COLUMN MAPPING */}
      {currentStep === 4 && preview && (
        <ProductCard className="p-6 rounded-2xl border border-border bg-card space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div>
              <h3 className="text-base font-bold text-foreground">
                گام ۴: تطبیق ستون‌های فایل با اقلام کانونیکال دیدبان
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                تطبیق هوشمند ستون‌های فایل منبع با فیلدهای استاندارد دفتر مالی
              </p>
            </div>

            {/* Template match banner */}
            {preview.matching_profile && (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-primary/10 border border-primary/20 text-xs">
                <Sparkles className="size-4 text-primary shrink-0" />
                <span className="text-foreground">
                  این فایل با الگوی <strong>«{preview.matching_profile.name}»</strong> تطابق دارد.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applyTemplate}
                  className="h-6 text-[10px] px-2 rounded-lg font-bold border-primary/30"
                >
                  استفاده از الگو
                </Button>
              </div>
            )}
          </div>

          {/* 3-Zone RTL Mapping Grid */}
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-3 text-xs font-bold text-muted-foreground border-b border-border/60 pb-2 px-3">
              <span className="col-span-5 sm:col-span-4 text-start">فیلد کانونیکال دیدبان (مقصد)</span>
              <span className="col-span-4 sm:col-span-5 text-start">ستون منبع فایل انتخابی</span>
              <span className="col-span-3 sm:col-span-3 text-start">نمونه داده واقعی</span>
            </div>

            <div className="space-y-2">
              {targetFieldList.map((target) => {
                const label = fieldLabels[target] || target;
                const isRequired = isRequiredField(
                  target,
                  preview.required_fields,
                  preview.alternative_required_fields
                );
                const currentMappedCol = mapping[target] || "";
                const sampleVal = preview.rows[0]?.raw[currentMappedCol];

                // Check suggestion confidence
                const suggestion = preview.suggestions.find((s) => s.target_field === target);
                const confidence = suggestion?.confidence;

                return (
                  <div
                    key={target}
                    className={`grid grid-cols-12 gap-3 items-center p-3 rounded-xl border transition-colors ${
                      isRequired && !currentMappedCol
                        ? "border-rose-500/40 bg-rose-500/[0.02]"
                        : "border-border/70 bg-card hover:border-primary/40"
                    }`}
                  >
                    {/* Right: Target Field Title & Badges */}
                    <div className="col-span-5 sm:col-span-4 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <strong className="text-xs font-bold text-foreground">{label}</strong>
                        {isRequired ? (
                          <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-600 border-rose-500/20 py-0 px-1.5">
                            الزامی
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">اختیاری</span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono block" dir="ltr">
                        {target}
                      </span>
                    </div>

                    {/* Center: Source Selector & Confidence */}
                    <div className="col-span-4 sm:col-span-5 flex items-center gap-2">
                      <SelectField
                        value={currentMappedCol}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMapping((prev) => ({ ...prev, [target]: val }));
                        }}
                        className={`h-8 text-xs py-0 ps-2 pe-6 rounded-lg w-full ${
                          isRequired && !currentMappedCol ? "border-rose-500/50" : ""
                        }`}
                      >
                        <SelectOption value="">— بدون نگاشت —</SelectOption>
                        {preview.columns.map((col) => (
                          <SelectOption key={col} value={col}>
                            {col}
                          </SelectOption>
                        ))}
                      </SelectField>

                      {confidence && currentMappedCol === suggestion?.source_column && (
                        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0 hidden sm:inline-block">
                          {confidence}٪ تطابق
                        </span>
                      )}
                    </div>

                    {/* Left: Real Sample Value */}
                    <div className="col-span-3 sm:col-span-3 min-w-0">
                      <span
                        className="block text-[11px] font-mono text-muted-foreground truncate bg-muted/30 px-2 py-1 rounded-lg"
                        dir="ltr"
                      >
                        {sampleVal !== undefined && sampleVal !== "" ? String(sampleVal) : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentStep(3)}
              className="text-xs h-9 rounded-xl gap-1.5"
            >
              <ArrowRight className="size-3.5" />
              <span>پیش‌نمایش سطرها</span>
            </Button>

            <Button
              disabled={!isMappingValid || validationBusy}
              onClick={proceedToValidation}
              className="h-9 px-6 text-xs rounded-xl gap-2 font-bold"
            >
              {validationBusy ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  <span>در حال کنترل کیفیت…</span>
                </>
              ) : (
                <>
                  <span>مرحله بعد: کنترل کیفیت و اعتبارسنجی</span>
                  <ArrowLeft className="size-4" />
                </>
              )}
            </Button>
          </div>
        </ProductCard>
      )}

      {/* STEP 5: QUALITY CONTROL & VALIDATION */}
      {currentStep === 5 && validationData && (
        <ProductCard className="p-6 rounded-2xl border border-border bg-card space-y-6">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">
              گام ۵: کنترل کیفیت و تفکیک رکوردهای معتبر از قرنطینه
            </h3>
            <p className="text-xs text-muted-foreground">
              بررسی قطعی تمام سطرهای فایل پیش از ثبت نهایی. رکوردهای معتبر پذیرفته می‌شوند و سطرهای دارای خطای مسدودکننده در قرنطینه می‌مانند (Partial Import).
            </p>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-muted/30 border border-border">
              <span className="text-[11px] text-muted-foreground block">کل ردیف‌های فایل:</span>
              <strong className="text-sm font-bold text-foreground block mt-1 font-mono">
                {validationData.batch.row_count?.toLocaleString("fa-IR") || "۰"}
              </strong>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-medium">
                رکوردهای معتبر (پذیرفته‌شده):
              </span>
              <strong className="text-sm font-bold text-emerald-600 dark:text-emerald-400 block mt-1 font-mono">
                {validationData.batch.accepted_count?.toLocaleString("fa-IR") || "۰"}
              </strong>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20">
              <span className="text-[11px] text-amber-700 dark:text-amber-400 block font-medium">
                هشدارهای غیرمسدودکننده:
              </span>
              <strong className="text-sm font-bold text-amber-600 dark:text-amber-400 block mt-1 font-mono">
                {(validationData.issue_counts["warning"] || 0).toLocaleString("fa-IR")}
              </strong>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-500/5 border border-rose-500/20">
              <span className="text-[11px] text-rose-700 dark:text-rose-400 block font-medium">
                رکوردهای ردشده (قرنطینه):
              </span>
              <strong className="text-sm font-bold text-rose-600 dark:text-rose-400 block mt-1 font-mono">
                {validationData.batch.rejected_count?.toLocaleString("fa-IR") || "۰"}
              </strong>
            </div>
          </div>

          {/* Grouped Issues Inspection */}
          {issues.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-foreground">
                فهرست اشکالات شناسایی‌شده در سطرهای فایل:
              </h4>
              <div className="rounded-xl border border-border overflow-hidden max-h-60 overflow-y-auto">
                <Table className="text-[11px]">
                  <TableHeader className="bg-muted/40 sticky top-0">
                    <TableRow>
                      <TableHead className="w-16 text-center">ردیف</TableHead>
                      <TableHead className="text-start">فیلد</TableHead>
                      <TableHead className="text-start">شرح خطا</TableHead>
                      <TableHead className="text-start">مقدار خام</TableHead>
                      <TableHead className="text-start">راهکار</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/60">
                    {issues.map((iss, i) => (
                      <TableRow key={i} className="hover:bg-muted/20">
                        <TableCell className="text-center font-bold text-muted-foreground font-mono">
                          {iss.row_number || "—"}
                        </TableCell>
                        <TableCell className="font-bold text-foreground">
                          {fieldLabels[iss.field || ""] || iss.field || "کل سطر"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={
                              iss.severity === "warning"
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-rose-600 dark:text-rose-400 font-medium"
                            }
                          >
                            {iss.message}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground truncate max-w-[120px]" dir="ltr">
                          {iss.raw_value || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-[10px]">
                          {iss.remedy || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentStep(4)}
              className="text-xs h-9 rounded-xl gap-1.5"
            >
              <ArrowRight className="size-3.5" />
              <span>تغییر نگاشت ستون‌ها</span>
            </Button>

            <Button
              onClick={() => setCurrentStep(6)}
              className="h-9 px-6 text-xs rounded-xl gap-2 font-bold"
            >
              <span>مرحله بعد: تنظیمات واحد ارزی و تأیید نهایی</span>
              <ArrowLeft className="size-4" />
            </Button>
          </div>
        </ProductCard>
      )}

      {/* STEP 6: CONFIRMATION, CURRENCY UNIT & PROCESSING */}
      {currentStep === 6 && (
        <ProductCard className="p-6 rounded-2xl border border-border bg-card space-y-6">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">
              گام ۶: تأیید واحد ارزی، تقویم و پردازش نهایی
            </h3>
            <p className="text-xs text-muted-foreground">
              بر اساس استاندارد قطعی دیدبان، واحد ارزی و تقویم فایل باید به صراحت تأیید شوند تا از هرگونه حدس خاموش جلوگیری گردد.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Currency Unit Explicit Selection */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
              <div className="flex items-center gap-2">
                <Coins className="size-4 text-primary" />
                <strong className="text-xs font-bold text-foreground">
                  مبالغ این فایل با چه واحدی ثبت شده‌اند؟
                </strong>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={currencyUnit === "rial" ? "default" : "outline"}
                  onClick={() => setCurrencyUnit("rial")}
                  className="h-9 text-xs rounded-xl font-bold"
                >
                  ریال (IRR)
                </Button>
                <Button
                  type="button"
                  variant={currencyUnit === "toman" ? "default" : "outline"}
                  onClick={() => setCurrencyUnit("toman")}
                  className="h-9 text-xs rounded-xl font-bold"
                >
                  تومان (تبدیل \(\times 10\) به ریال)
                </Button>
              </div>

              <span className="text-[11px] text-muted-foreground block leading-relaxed">
                {currencyUnit === "toman"
                  ? "توجه: ارقام منبع در هنگام ثبت دفاتر دقیقاً ضرب در ۱۰ شده و با واحد ریال کانونیکال ذخیره می‌شوند."
                  : "ارقام بدون تغییر مقیاس در دفاتر کانونیکال ریالی ثبت خواهند شد."}
              </span>
            </div>

            {/* Calendar Selection */}
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-primary" />
                <strong className="text-xs font-bold text-foreground">تقویم تاریخ‌های فایل:</strong>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={calendar === "jalali" ? "default" : "outline"}
                  onClick={() => setCalendar("jalali")}
                  className="h-9 text-xs rounded-xl font-bold"
                >
                  شمسی (هجری خورشیدی)
                </Button>
                <Button
                  type="button"
                  variant={calendar === "gregorian" ? "default" : "outline"}
                  onClick={() => setCalendar("gregorian")}
                  className="h-9 text-xs rounded-xl font-bold"
                >
                  میلادی (Gregorian)
                </Button>
              </div>

              <span className="text-[11px] text-muted-foreground block leading-relaxed">
                تاریخ‌های ۱۴۰۴/۰۶/۲۱ به تقویم میلادی استاندارد تبدیل و ثبت می‌شوند.
              </span>
            </div>
          </div>

          {/* Reusable Template Option */}
          <div className="p-4 rounded-xl border border-border/80 bg-card space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(e) => setSaveAsTemplate(e.target.checked)}
                className="size-4 rounded border-border text-primary focus:ring-primary"
              />
              <span className="text-xs font-bold text-foreground">
                ذخیره این نگاشت به‌عنوان الگوی پیش‌فرض برای بارگذاری‌های آینده
              </span>
            </label>

            {saveAsTemplate && (
              <div className="ps-6 space-y-1.5">
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="نام الگو (مثلاً: سپیدار - فاکتورهای فروش)"
                  className="text-xs h-8 max-w-sm rounded-lg"
                />
                <span className="text-[11px] text-muted-foreground block">
                  در فایل‌های مشابه بعدی، نگاشت ستون‌ها به طور خودکار پیشنهاد خواهد شد.
                </span>
              </div>
            )}
          </div>

          {/* Progress Indicator when committing */}
          {commitBusy && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-primary">
                <span>{progressMessage}</span>
                <span className="font-mono">{commitProgress}٪</span>
              </div>
              <div className="w-full bg-primary/20 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${commitProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentStep(5)}
              className="text-xs h-9 rounded-xl gap-1.5"
            >
              <ArrowRight className="size-3.5" />
              <span>بررسی کیفیت</span>
            </Button>

            <Button
              disabled={commitBusy}
              onClick={performCommit}
              className="h-9 px-6 text-xs rounded-xl gap-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {commitBusy ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin" />
                  <span>در حال ثبت نهایی در دفاتر…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  <span>تأیید و شروع ثبت نهایی</span>
                </>
              )}
            </Button>
          </div>
        </ProductCard>
      )}

      {/* STEP 7: FINAL RESULT */}
      {currentStep === 7 && activeBatch && (
        <ProductCard className="p-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.03] space-y-6 text-center">
          <div className="size-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
            <CheckCircle2 className="size-8" />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-foreground">
              پردازش با موفقیت انجام شد
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              اطلاعات معتبر در دفاتر مالی کانونیکال ثبت شدند و برای تحلیل‌های نقدینگی و صورت‌های مالی در دسترس هستند.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-start">
            <div className="p-3 rounded-xl bg-card border border-border">
              <span className="text-[11px] text-muted-foreground block">رکوردهای ثبت‌شده:</span>
              <strong className="text-base font-bold text-emerald-600 font-mono block mt-0.5">
                {activeBatch.accepted_count?.toLocaleString("fa-IR") || "۰"}
              </strong>
            </div>

            <div className="p-3 rounded-xl bg-card border border-border">
              <span className="text-[11px] text-muted-foreground block">رکوردهای ردشده:</span>
              <strong className="text-base font-bold text-muted-foreground font-mono block mt-0.5">
                {activeBatch.rejected_count?.toLocaleString("fa-IR") || "۰"}
              </strong>
            </div>

            <div className="p-3 rounded-xl bg-card border border-border">
              <span className="text-[11px] text-muted-foreground block">واحد ارزی:</span>
              <strong className="text-xs font-bold text-foreground block mt-1">
                {currencyUnit === "toman" ? "تبدیل تومان به ریال" : "ریال"}
              </strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-4 border-t border-border/60">
            <Button
              onClick={() => onNavigateTab && onNavigateTab("overview")}
              className="h-9 px-5 text-xs rounded-xl font-bold"
            >
              بازگشت به مرکز داده‌ها
            </Button>

            <Button
              variant="outline"
              onClick={() => onNavigateTab && onNavigateTab("history")}
              className="h-9 px-4 text-xs rounded-xl font-bold"
            >
              مشاهده در تاریخچه
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setSelectedFile(null);
                setActiveBatch(null);
                setPreview(null);
                setCurrentStep(1);
              }}
              className="h-9 px-4 text-xs rounded-xl"
            >
              بارگذاری سند جدید
            </Button>
          </div>
        </ProductCard>
      )}
    </div>
  );
}
