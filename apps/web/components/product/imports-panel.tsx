"use client";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ProductCard } from "./product-card";
import { SelectField, SelectOption } from "./select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  DragEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";

import { API_URL, api } from "@/lib/product-api";
import type { Company, ImportBatch, ImportStatus } from "@/lib/product-types";
import { FileUp } from "@/components/ui/icons";

import { Icon } from "./icons";

const importStatusLabels: Record<ImportStatus, string> = {
  uploaded: "دریافت شد",
  inspecting: "در حال بررسی امنیتی",
  awaiting_mapping: "آمادهٔ تطبیق ستون‌ها",
  validating: "در حال اعتبارسنجی",
  queued: "در صف پردازش",
  processing: "در حال پردازش",
  completed: "تکمیل‌شده",
  completed_limited: "تکمیل محدود",
  failed: "رد شده",
  cancelled: "لغوشده",
};

const statusBadgeClasses: Record<ImportStatus, string> = {
  uploaded: "bg-ds-warning/10 text-ds-warning border-ds-warning/20",
  inspecting: "bg-primary/10 text-primary border-primary/20",
  awaiting_mapping: "bg-primary/10 text-primary border-primary/20",
  validating: "bg-primary/10 text-primary border-primary/20",
  queued: "bg-muted text-muted-foreground border-border",
  processing: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-ds-success/10 text-ds-success border-ds-success/20",
  completed_limited: "bg-ds-success/10 text-ds-success border-ds-success/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const formatBytes = (bytes: number) =>
  `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} مگابایت`;

function downloadTemplate(type: "accounting" | "bank" | "sales") {
  let headers = "";
  let sampleRow = "";
  let filename = "";

  if (type === "accounting") {
    headers =
      "تاریخ سند,شماره سند,کد معین,نام حساب,شرح آرتیکل,بدهکار (ریال),بستانکار (ریال),کد پیگیری";
    sampleRow =
      "1405/01/15,1024,1101,صندوق مرکزی,دریافت از مشتری بابت تسویه فاکتور,50000000,0,TRX-9821";
    filename = "template_accounting_journal.csv";
  } else if (type === "bank") {
    headers =
      "تاریخ تراکنش,زمان,شماره پیگیری,شرح تراکنش,واریز (ریال),برداشت (ریال),مانده (ریال)";
    sampleRow =
      "1405/01/15,14:32:10,98234120,انتقال پایا از شرکت الف,50000000,0,245000000";
    filename = "template_bank_statement.csv";
  } else {
    headers =
      "شماره فاکتور,تاریخ صدور,کد مشتری,نام مشتری,مبلغ فاکتور (ریال),مهلت تسویه (روز),وضعیت";
    sampleRow =
      "INV-1405-01,1405/01/10,CUST-102,شرکت رایان سیستم,120000000,30,صادرشده";
    filename = "template_sales_invoices.csv";
  }

  const csvContent = "\uFEFF" + headers + "\n" + sampleRow + "\n";
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ImportsPanel({ company }: { company: Company }) {
  const [items, setItems] = useState<ImportBatch[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewLines, setFilePreviewLines] = useState<string[][]>([]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [batchToDelete, setBatchToDelete] = useState<ImportBatch | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const canUpload = company.role !== "viewer";

  const load = useCallback(async () => {
    try {
      setItems(await api<ImportBatch[]>(`/companies/${company.id}/imports`));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "فهرست فایل‌ها دریافت نشد.",
      );
    }
  }, [company.id]);

  async function confirmDelete() {
    if (!batchToDelete) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      await api(`/companies/${company.id}/imports/${batchToDelete.id}`, {
        method: "DELETE",
      });
      setItems((current) =>
        current.filter((item) => item.id !== batchToDelete.id),
      );
      setNotice(`فایل «${batchToDelete.original_name}» با موفقیت حذف شد.`);
      setBatchToDelete(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "حذف فایل انجام نشد.",
      );
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const hasActiveBatches = items.some((item) =>
      ["inspecting", "validating", "queued", "processing"].includes(
        item.status,
      ),
    );
    if (!hasActiveBatches) return;

    const timer = window.setInterval(() => {
      void load();
    }, 4000);

    return () => {
      window.clearInterval(timer);
    };
  }, [items, load]);

  function acceptFile(file: File | undefined) {
    setError("");
    setNotice("");
    if (!file) return;
    if (
      !["csv", "xlsx"].includes(file.name.split(".").pop()?.toLowerCase() ?? "")
    ) {
      setSelectedFile(null);
      setError("فقط فایل‌های CSV و XLSX پذیرفته می‌شوند.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setSelectedFile(null);
      setError("حجم فایل نباید بیشتر از ۵۰ مگابایت باشد.");
      return;
    }
    setSelectedFile(file);

    // If CSV, parse first 6 lines for instant live preview
    if (file.name.toLowerCase().endsWith(".csv")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) {
          const lines = text
            .split(/\r?\n/)
            .filter((l) => l.trim().length > 0)
            .slice(0, 6)
            .map((line) =>
              line.split(",").map((c) => c.trim().replace(/^["']|["']$/g, "")),
            );
          setFilePreviewLines(lines);
        }
      };
      reader.readAsText(file.slice(0, 10000));
    } else {
      setFilePreviewLines([]);
    }
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setError("ابتدا یک فایل انتخاب کنید.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    form.set("file", selectedFile);
    try {
      const created = await api<ImportBatch>(
        `/companies/${company.id}/imports/uploads`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
          body: form,
        },
      );
      setItems((current) => [
        created,
        ...current.filter((item) => item.id !== created.id),
      ]);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setNotice("فایل با موفقیت دریافت شد و بررسی امنیتی آن آغاز شده است.");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "بارگذاری فایل انجام نشد.",
      );
    } finally {
      setBusy(false);
    }
  }

  const [sourceKind, setSourceKind] = useState<"accounting" | "bank" | "sales">(
    "accounting",
  );
  const [sourceLabel, setSourceLabel] = useState("ورودی مالی سپیدار");
  const [filterTab, setFilterTab] = useState<"all" | "active" | "completed">(
    "all",
  );

  const completedCount = items.filter(
    (i) => i.stage === "normalized" || i.status === "completed",
  ).length;
  const pendingCount = items.filter((i) =>
    [
      "uploaded",
      "inspecting",
      "awaiting_mapping",
      "validating",
      "queued",
      "processing",
    ].includes(i.status),
  ).length;

  const filteredItems = items.filter((item) => {
    if (filterTab === "active") {
      return [
        "uploaded",
        "inspecting",
        "awaiting_mapping",
        "validating",
        "queued",
        "processing",
      ].includes(item.status);
    }
    if (filterTab === "completed") {
      return item.stage === "normalized" || item.status === "completed";
    }
    return true;
  });

  return (
    <div className="imports-workspace space-y-6" dir="rtl">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1">
            <span>تنظیمات و مدیریت سامانه</span>
            <span>/</span>
            <span className="text-primary font-bold">ورود و پردازش اسناد</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-normal flex items-center gap-2.5">
            <span className="size-8 rounded-[var(--ds-card-radius)] bg-primary/10 text-primary flex items-center justify-center">
              <FileUp className="size-4" />
            </span>
            ورود و پردازش اسناد مالی
          </h1>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            بارگذاری فایل‌های اکسل و CSV دفاتر کل، صورت‌حساب‌های بانکی و
            فاکتورها، قرنطینه امنیتی و اعتبارسنجی خودکار قبل از تجمیع در پایگاه
            مالی.
          </p>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <ProductCard className="p-4 rounded-[var(--ds-card-radius)] border border-border/80 bg-card/60    transition-all duration-200 cursor-default group">
          <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors block mb-1">
            کل اسناد بارگذاری‌شده
          </span>
          <strong className="text-lg sm:text-xl font-bold text-foreground font-mono  transition-transform inline-block origin-right">
            {new Intl.NumberFormat("fa-IR").format(items.length)}
          </strong>
        </ProductCard>
        <ProductCard className="p-4 rounded-[var(--ds-card-radius)] border border-border/80 bg-card/60    transition-all duration-200 cursor-default group">
          <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors block mb-1">
            در صف بررسی یا نگاشت
          </span>
          <strong className="text-lg sm:text-xl font-bold text-ds-warning font-mono  transition-transform inline-block origin-right">
            {new Intl.NumberFormat("fa-IR").format(pendingCount)}
          </strong>
        </ProductCard>
        <ProductCard className="p-4 rounded-[var(--ds-card-radius)] border border-border/80 bg-card/60    transition-all duration-200 cursor-default group">
          <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors block mb-1">
            تکمیل و تجمیع در دفاتر
          </span>
          <strong className="text-lg sm:text-xl font-bold text-ds-success font-mono  transition-transform inline-block origin-right">
            {new Intl.NumberFormat("fa-IR").format(completedCount)}
          </strong>
        </ProductCard>
        <ProductCard className="p-4 rounded-[var(--ds-card-radius)] border border-border/80 bg-card/60  flex items-center justify-between   transition-all duration-200 cursor-default group">
          <div>
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors block mb-1">
              امنیت اسناد
            </span>
            <strong className="text-xs font-bold text-ds-success flex items-center gap-1.5">
              <Icon
                name="shield"
                className="size-3.5 transition-transform duration-200  "
              />
              قرنطینه و اسکن فعال
            </strong>
          </div>
        </ProductCard>
      </div>

      {/* Main Upload Card */}
      <ProductCard
        className="imports-card p-6 sm:p-7 rounded-[var(--ds-card-radius)] border border-border bg-card shadow-[var(--ds-shadow-sm)] space-y-6"
        aria-labelledby="imports-title"
      >
        <div className="card-heading imports-heading flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <span className="overline block text-[11px] font-bold text-primary mb-0.5">
              درگاه امن دریافت داده
            </span>
            <h3
              id="imports-title"
              className="text-base sm:text-lg font-bold text-foreground"
            >
              فایل‌های مالی بارگذاری‌شده
            </h3>
          </div>
          <Badge
            variant="outline"
            className="secure-badge bg-ds-success/10 text-ds-success border-ds-success/20 text-xs gap-1.5 self-start sm:self-center"
          >
            <Icon name="shield" className="size-3.5" />
            قرنطینه و اسکن فعال
          </Badge>
        </div>

        {canUpload ? (
          <form
            className="upload-form grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-6"
            onSubmit={upload}
          >
            {/* Interactive Dropzone */}
            <Input
              ref={inputRef}
              className="sr-only"
              id="financial-file"
              name="file-picker"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />
            <div
              className={`dropzone group relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-[var(--ds-card-radius)] text-center transition-all cursor-pointer ${
                dragging
                  ? "border-primary bg-primary/5  shadow-[var(--ds-shadow-md)]"
                  : selectedFile
                    ? "border-ds-success/50 bg-ds-success/5 shadow-2xs"
                    : "border-border/80 bg-muted/20 hover:border-primary/50 hover:bg-muted/30"
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
              onClick={() => inputRef.current?.click()}
            >
              <div
                className={`size-14 rounded-[var(--ds-card-radius)] flex items-center justify-center mb-3.5 transition-transform duration-200   ${
                  selectedFile
                    ? "bg-ds-success/10 text-ds-success scale-105"
                    : "bg-primary/10 text-primary"
                }`}
              >
                <Icon
                  name={selectedFile ? "file" : "upload"}
                  className="size-6 transition-transform duration-200 "
                />
              </div>
              {selectedFile ? (
                <div className="space-y-1.5 max-w-sm">
                  <strong className="block text-sm font-bold text-foreground truncate">
                    {selectedFile.name}
                  </strong>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground font-mono">
                    <span>{formatBytes(selectedFile.size)}</span>
                    <span>·</span>
                    <span className="text-ds-success font-sans font-medium">
                      آماده بارگذاری
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <strong className="block text-sm font-bold text-foreground">
                    فایل اکسل یا CSV را اینجا بکشید یا کلیک کنید
                  </strong>
                  <p className="text-xs text-muted-foreground">
                    فرمت‌های مجاز: XLSX و CSV (حداکثر ۵۰ مگابایت)
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="secondary-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                >
                  {selectedFile ? "تغییر فایل" : "انتخاب از کامپیوتر"}
                </Button>
                {selectedFile && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewModalOpen(true);
                    }}
                  >
                    <Icon name="file" className="size-3.5 text-primary" />
                    <span>پیش‌نمایش محتوا</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Ingestion Settings & Presets */}
            <div className="upload-fields flex flex-col justify-between gap-5 p-1 sm:p-2">
              <div className="space-y-4">
                {/* Source Kind Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-foreground">
                    نوع منبع داده
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="surface"
                      size="auto"
                      motion="none"
                      type="button"
                      onClick={() => {
                        setSourceKind("accounting");
                        if (
                          !sourceLabel ||
                          sourceLabel.includes("بانک") ||
                          sourceLabel.includes("فروش")
                        ) {
                          setSourceLabel("دفتر کل حسابداری");
                        }
                      }}
                      className={`p-2.5 rounded-[var(--ds-card-radius)] border text-center text-xs transition-all ${
                        sourceKind === "accounting"
                          ? "bg-primary/10 border-primary text-primary font-bold shadow-2xs"
                          : "border-border/70 bg-card text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <span className="block font-bold">
                        نرم‌افزار حسابداری
                      </span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5 font-normal">
                        سپیدار، راهکاران و…
                      </span>
                    </Button>
                    <Button
                      variant="surface"
                      size="auto"
                      motion="none"
                      type="button"
                      onClick={() => {
                        setSourceKind("bank");
                        if (
                          !sourceLabel ||
                          sourceLabel.includes("دفتر") ||
                          sourceLabel.includes("فروش")
                        ) {
                          setSourceLabel("گردش حساب بانکی");
                        }
                      }}
                      className={`p-2.5 rounded-[var(--ds-card-radius)] border text-center text-xs transition-all ${
                        sourceKind === "bank"
                          ? "bg-primary/10 border-primary text-primary font-bold shadow-2xs"
                          : "border-border/70 bg-card text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <span className="block font-bold">گردش بانکی</span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5 font-normal">
                        صورت‌حساب بانک‌ها
                      </span>
                    </Button>
                    <Button
                      variant="surface"
                      size="auto"
                      motion="none"
                      type="button"
                      onClick={() => {
                        setSourceKind("sales");
                        if (
                          !sourceLabel ||
                          sourceLabel.includes("دفتر") ||
                          sourceLabel.includes("بانک")
                        ) {
                          setSourceLabel("فروش و درآمد");
                        }
                      }}
                      className={`p-2.5 rounded-[var(--ds-card-radius)] border text-center text-xs transition-all ${
                        sourceKind === "sales"
                          ? "bg-primary/10 border-primary text-primary font-bold shadow-2xs"
                          : "border-border/70 bg-card text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      <span className="block font-bold">فروش و درآمد</span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5 font-normal">
                        فاکتورها و سامانه مودیان
                      </span>
                    </Button>
                  </div>
                  {/* Hidden select field for standard form submission fallback */}
                  <div className="sr-only">
                    <SelectField
                      name="source_kind"
                      value={sourceKind}
                      onChange={(e) => setSourceKind(e.target.value as any)}
                    >
                      <SelectOption value="accounting">
                        نرم‌افزار حسابداری
                      </SelectOption>
                      <SelectOption value="bank">گردش حساب بانکی</SelectOption>
                      <SelectOption value="sales">فروش و درآمد</SelectOption>
                    </SelectField>
                  </div>
                </div>

                {/* Source Label */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-foreground">
                    عنوان یا برچسب سند
                  </label>
                  <Input
                    name="source_label"
                    required
                    minLength={2}
                    maxLength={160}
                    value={sourceLabel}
                    onChange={(e) => setSourceLabel(e.target.value)}
                    placeholder="مثلاً دفتر کل شهریور ۱۴۰۵"
                  />
                  <span className="text-[11px] text-muted-foreground block">
                    این عنوان برای جستجو و پیگیری این ورودی در گزارش‌ها استفاده
                    خواهد شد.
                  </span>
                </div>
              </div>

              {/* Submit CTA */}
              <div className="pt-2">
                <Button
                  type="submit"
                  className="primary-button gap-2 w-full"
                  disabled={busy || !selectedFile}
                >
                  <Icon name="upload" className="size-4" />
                  {busy
                    ? "در حال دریافت و اسکن امنیتی…"
                    : "بارگذاری امن و شروع پردازش"}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <div className="viewer-note flex items-center gap-2.5 p-3.5 rounded-[var(--ds-card-radius)] bg-muted/60 border border-border text-xs text-muted-foreground">
            <Icon name="shield" className="size-4 text-primary shrink-0" />
            <span>
              <strong className="font-bold text-foreground">
                دسترسی محدود (مشاهده‌گر):{" "}
              </strong>
              برای بارگذاری اسناد جدید، نیاز به نقش مدیر مالی یا حسابدار ارشد
              دارید.
            </span>
          </div>
        )}

        {/* Standard Templates Download Bar */}
        <div className="p-3.5 rounded-[var(--ds-card-radius)] border border-border/70 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
              <Icon name="file" className="size-4" />
            </span>
            <div>
              <span className="font-bold text-foreground block">
                الگوهای آماده برای ورود سریع اسناد
              </span>
              <span className="text-[11px] text-muted-foreground block">
                فایل نمونه با ستون‌های استاندارد را دانلود و بعد از درج ارقام،
                بارگذاری کنید:
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadTemplate("accounting")}
              className="text-[11px]"
            >
              الگوی دفتر روزنامه / کل
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadTemplate("bank")}
              className="text-[11px]"
            >
              الگوی گردش حساب بانک
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => downloadTemplate("sales")}
              className="text-[11px]"
            >
              الگوی فاکتورهای فروش
            </Button>
          </div>
        </div>

        {/* Upload Messages / Feedback */}
        <div className="upload-messages space-y-2" aria-live="polite">
          {error && (
            <Alert
              variant="destructive"
              className="form-error text-xs p-3.5 rounded-[var(--ds-card-radius)]"
              role="alert"
            >
              {error}
            </Alert>
          )}
          {notice && (
            <Alert className="form-success text-xs p-3.5 rounded-[var(--ds-card-radius)] bg-ds-success/10 text-ds-success border-ds-success/20">
              {notice}
            </Alert>
          )}
        </div>

        {/* Recent Files Table */}
        <div className="imports-list space-y-3 pt-2" aria-label="فایل‌های اخیر">
          <div className="list-title flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <strong className="text-xs sm:text-sm font-bold text-foreground">
                تاریخچه اسناد بارگذاری‌شده
              </strong>
              <span className="text-[11px] font-mono font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded-md">
                {new Intl.NumberFormat("fa-IR").format(items.length)} سند
              </span>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-[var(--ds-card-radius)] border border-border/60 self-start sm:self-center">
              <Button
                variant="surface"
                size="auto"
                motion="none"
                type="button"
                onClick={() => setFilterTab("all")}
                className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                  filterTab === "all"
                    ? "bg-card text-foreground font-bold shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                همه
              </Button>
              <Button
                variant="surface"
                size="auto"
                motion="none"
                type="button"
                onClick={() => setFilterTab("active")}
                className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                  filterTab === "active"
                    ? "bg-card text-ds-warning font-bold shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                در انتظار / فعال ({pendingCount})
              </Button>
              <Button
                variant="surface"
                size="auto"
                motion="none"
                type="button"
                onClick={() => setFilterTab("completed")}
                className={`px-2.5 py-1 text-xs rounded-lg transition-all ${
                  filterTab === "completed"
                    ? "bg-card text-ds-success font-bold shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                تکمیل‌شده ({completedCount})
              </Button>
            </div>
          </div>

          {!filteredItems.length ? (
            <div className="imports-empty py-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-[var(--ds-card-radius)] border border-dashed border-border/60 bg-muted/10">
              <div className="size-10 rounded-[var(--ds-card-radius)] bg-muted flex items-center justify-center text-muted-foreground mb-1">
                <Icon name="file" className="size-5" />
              </div>
              <strong className="text-foreground font-medium">
                سندی در این فیلتر یافت نشد.
              </strong>
              <p className="text-[11px] text-muted-foreground">
                برای شروع، فایل مالی خود را در بخش بالا بارگذاری نمایید.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60 border border-border/60 rounded-[var(--ds-card-radius)] overflow-hidden bg-card/40">
              {filteredItems.map((item) => (
                <article
                  className="import-row group p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-all duration-150"
                  key={item.id}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`file-state size-10 rounded-[var(--ds-card-radius)] flex items-center justify-center shrink-0 border transition-transform duration-200   ${
                        item.scan_status === "clean"
                          ? "bg-ds-success/10 text-ds-success border-ds-success/20"
                          : item.scan_status === "infected"
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      <Icon name="file" className="size-4" />
                    </span>

                    <div className="file-info min-w-0">
                      <strong className="block text-xs sm:text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                        {item.original_name}
                      </strong>
                      <small className="block text-[11px] text-muted-foreground truncate mt-0.5">
                        <span className="font-semibold text-foreground/80">
                          {item.source_label}
                        </span>{" "}
                        · {formatBytes(item.size_bytes)} ·{" "}
                        {new Intl.DateTimeFormat("fa-IR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(item.created_at))}
                      </small>
                      {item.duplicate_detected && (
                        <span className="duplicate-note block text-[10px] text-ds-warning mt-0.5 font-medium">
                          ⚠️ نسخه‌ای با محتوای یکسان قبلاً در سامانه ثبت شده
                          است.
                        </span>
                      )}
                      {item.failure_message && (
                        <span className="failure-note block text-[10px] text-destructive mt-0.5">
                          {item.failure_message}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                    <div className="file-progress flex flex-col items-end gap-1 min-w-[100px]">
                      <Badge
                        variant="outline"
                        className={`status text-[11px] font-medium ${statusBadgeClasses[item.status]}`}
                      >
                        {importStatusLabels[item.status]}
                      </Badge>
                      {["uploaded", "inspecting"].includes(item.status) && (
                        <Progress
                          className="progress-track w-20 h-1.5"
                          value={item.progress}
                        />
                      )}
                    </div>

                    <div className="import-actions flex items-center gap-1.5">
                      {item.scan_status === "clean" && (
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="prepare-link gap-1.5"
                        >
                          <Link
                            href={`/companies/${company.id}/imports/${item.id}`}
                          >
                            <Icon name="table" className="size-3.5" />
                            <span>
                              {item.stage === "normalized"
                                ? "مشاهده جزئیات"
                                : "آماده‌سازی و تطبیق"}
                            </span>
                          </Link>
                        </Button>
                      )}

                      {item.scan_status === "clean" ? (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="download-button size-8 text-muted-foreground hover:text-foreground"
                          title={`دریافت ${item.original_name}`}
                        >
                          <a
                            href={`${API_URL}/companies/${company.id}/imports/${item.id}/download`}
                          >
                            <Icon name="download" className="size-3.5" />
                            <span className="sr-only">
                              دریافت {item.original_name}
                            </span>
                          </a>
                        </Button>
                      ) : (
                        <span
                          className="download-placeholder size-8"
                          aria-hidden="true"
                        />
                      )}

                      {canUpload && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="delete-button size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title={`حذف ${item.original_name}`}
                          onClick={() => setBatchToDelete(item)}
                        >
                          <Icon name="trash" className="size-3.5" />
                          <span className="sr-only">
                            حذف {item.original_name}
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        <Dialog
          open={batchToDelete !== null}
          onOpenChange={(open) => {
            if (!open && !deleting) setBatchToDelete(null);
          }}
        >
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-destructive flex items-center gap-2 text-base font-bold">
                <Icon name="trash" className="size-5 text-destructive" />
                حذف سند مالی
              </DialogTitle>
              <DialogDescription className="text-xs leading-relaxed mt-2 text-muted-foreground">
                آیا از حذف فایل «
                <strong className="text-foreground">
                  {batchToDelete?.original_name}
                </strong>
                » اطمینان دارید؟ تمامی ردیف‌ها و داده‌های استخراج‌شده از این سند
                به طور کامل حذف خواهند شد. این عملیات غیرقابل بازگشت است.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex gap-2 sm:justify-end mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setBatchToDelete(null)}
                disabled={deleting}
                className=""
              >
                انصراف
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDelete}
                disabled={deleting}
                className="gap-1.5"
              >
                <Icon name="trash" className="size-4" />
                {deleting ? "در حال حذف…" : "حذف قطعی سند"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Live File Preview Dialog */}
        <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
          <DialogContent className="sm:max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2 text-base font-bold">
                <Icon name="file" className="size-5 text-primary" />
                <span>پیش‌نمایش سطور اولیه: {selectedFile?.name}</span>
              </DialogTitle>
              <DialogDescription className="text-xs leading-relaxed mt-1 text-muted-foreground">
                بررسی فوری ستون‌ها و ارقام قبل از آغاز اعتبارسنجی نهایی
              </DialogDescription>
            </DialogHeader>

            {filePreviewLines.length > 0 ? (
              <div className="overflow-x-auto max-h-72 border border-border/70 rounded-[var(--ds-card-radius)] my-2">
                <table className="w-full text-xs text-start">
                  <thead className="bg-muted/70 font-bold border-b border-border/70 sticky top-0">
                    <tr>
                      {filePreviewLines[0].map((col, idx) => (
                        <th
                          key={idx}
                          className="p-2 text-start whitespace-nowrap font-medium text-foreground"
                        >
                          {col || `ستون ${idx + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {filePreviewLines.slice(1).map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-muted/30">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="p-2 whitespace-nowrap font-mono text-[11px] text-muted-foreground"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground space-y-2">
                <div className="size-10 rounded-[var(--ds-card-radius)] bg-primary/10 text-primary grid place-items-center mx-auto mb-2">
                  <Icon name="file" className="size-5" />
                </div>
                <strong className="block text-foreground font-bold">
                  فایل اکسل (XLSX) انتخاب شده است
                </strong>
                <p className="text-[11px] max-w-sm mx-auto">
                  پیش‌نمایش کامل داده‌های اکسل پس از بارگذاری در مرحله «تطبیق و
                  نگاشت ستون‌ها» نمایش داده خواهد شد.
                </p>
                <div className="text-[11px] font-mono text-muted-foreground bg-muted/40 p-2 rounded-lg inline-block mt-2">
                  حجم فایل:{" "}
                  {selectedFile ? formatBytes(selectedFile.size) : "—"}
                </div>
              </div>
            )}

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewModalOpen(false)}
                className=""
              >
                بستن پنجره
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </ProductCard>
    </div>
  );
}
