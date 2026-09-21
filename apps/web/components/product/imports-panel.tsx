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

import { DragEvent, FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

import { API_URL, api } from "@/lib/product-api";
import type { Company, ImportBatch, ImportStatus } from "@/lib/product-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinancialModelWorkspace } from "./financial-model-workspace";
import { FileUp, Layers } from "lucide-react";

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
  uploaded: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  inspecting: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  awaiting_mapping: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20",
  validating: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  queued: "bg-muted text-muted-foreground border-border",
  processing: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  completed_limited: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const formatBytes = (bytes: number) =>
  `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} مگابایت`;

export type ImportsTab = "files" | "classification";

export function ImportsPanel({ company, defaultTab = "files" }: { company: Company; defaultTab?: ImportsTab }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab") as ImportsTab | null;
  const initialTab = tabParam && ["files", "classification"].includes(tabParam)
    ? tabParam
    : defaultTab;

  const [activeTab, setActiveTab] = useState<ImportsTab>(initialTab);

  useEffect(() => {
    if (tabParam && ["files", "classification"].includes(tabParam)) {
      setActiveTab(tabParam);
    } else if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [tabParam, defaultTab]);

  const handleTabChange = (value: string) => {
    const nextTab = value as ImportsTab;
    setActiveTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const [items, setItems] = useState<ImportBatch[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
      setError(caught instanceof Error ? caught.message : "فهرست فایل‌ها دریافت نشد.");
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
      setItems((current) => current.filter((item) => item.id !== batchToDelete.id));
      setNotice(`فایل «${batchToDelete.original_name}» با موفقیت حذف شد.`);
      setBatchToDelete(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حذف فایل انجام نشد.");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const hasActiveBatches = items.some((item) =>
      ["inspecting", "validating", "queued", "processing"].includes(item.status)
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
    if (!["csv", "xlsx"].includes(file.name.split(".").pop()?.toLowerCase() ?? "")) {
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
      const created = await api<ImportBatch>(`/companies/${company.id}/imports/uploads`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: form,
      });
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setNotice("فایل با موفقیت دریافت شد و بررسی امنیتی آن آغاز شده است.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "بارگذاری فایل انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="imports-workspace space-y-6" dir="rtl">
      {/* Hub Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary mb-1">
            <FileUp className="size-4" />
            <span>اسناد مالی</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            ورود و پردازش اسناد مالی
          </h1>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} variant="line" className="w-full">
        <TabsList className="w-full border-b border-border/80 gap-2 sm:gap-6 overflow-x-auto justify-start">
          <TabsTrigger value="files" className="gap-2 text-xs sm:text-sm py-2.5">
            <FileUp className="size-4 text-primary" />
            <span>بارگذاری فایل‌ها</span>
          </TabsTrigger>
          <TabsTrigger value="classification" className="gap-2 text-xs sm:text-sm py-2.5">
            <Layers className="size-4 text-cyan-500" />
            <span>کدینگ و سرفصل‌ها</span>
          </TabsTrigger>
        </TabsList>

        <div className="pt-4">
          <TabsContent value="files" className="m-0 focus-visible:outline-none">
            <ProductCard className="imports-card p-6 rounded-2xl border border-border bg-card shadow-sm space-y-6" aria-labelledby="imports-title">
              <div className="card-heading imports-heading flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-4">
                <div>
                  <span className="overline block text-[11px] font-bold text-primary mb-0.5">ورودی امن داده</span>
                  <h3 id="imports-title" className="text-base sm:text-lg font-bold text-foreground">فایل‌های مالی بارگذاری‌شده</h3>
                </div>
                <Badge variant="outline" className="secure-badge bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-xs gap-1.5 self-start sm:self-center">
                  <Icon name="shield" className="size-3.5" />
                  قرنطینه و اسکن فعال
                </Badge>
              </div>

      {canUpload ? (
        <form className="upload-form grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4" onSubmit={upload}>
          <div
            className={`dropzone flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl text-center transition-all cursor-pointer ${
              dragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : selectedFile
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-border/80 bg-muted/20 hover:border-primary/50 hover:bg-muted/40"
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
            <Input
              ref={inputRef}
              className="sr-only"
              id="financial-file"
              name="file-picker"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />
            <span className="upload-icon size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Icon name={selectedFile ? "file" : "upload"} className="size-5" />
            </span>
            {selectedFile ? (
              <div className="space-y-1">
                <strong className="block text-xs font-bold text-foreground truncate max-w-xs">{selectedFile.name}</strong>
                <small className="block text-[11px] text-muted-foreground">{formatBytes(selectedFile.size)}</small>
              </div>
            ) : (
              <div className="space-y-1">
                <strong className="block text-xs font-bold text-foreground">فایل را اینجا رها کنید یا کلیک کنید</strong>
                <small className="block text-[11px] text-muted-foreground">CSV یا XLSX، حداکثر ۵۰ مگابایت</small>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="secondary-button mt-3 h-8 text-xs font-medium"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              {selectedFile ? "تغییر فایل" : "انتخاب فایل"}
            </Button>
          </div>

          <div className="upload-fields flex flex-col justify-between gap-4 p-2">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">نوع منبع</label>
                <SelectField name="source_kind" defaultValue="accounting" className="h-10 text-xs">
                  <SelectOption value="accounting">نرم‌افزار حسابداری</SelectOption>
                  <SelectOption value="bank">گردش حساب بانکی</SelectOption>
                  <SelectOption value="sales">فروش و درآمد</SelectOption>
                </SelectField>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">عنوان منبع</label>
                <Input
                  name="source_label"
                  required
                  minLength={2}
                  maxLength={160}
                  defaultValue="ورودی مالی"
                  placeholder="مثلاً دفتر کل شهریور"
                  className="h-10 text-xs bg-background"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="primary-button h-10 text-xs font-bold gap-2 w-full mt-2"
              disabled={busy}
            >
              <Icon name="upload" className="size-4" />
              {busy ? "در حال دریافت…" : "بارگذاری امن"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="viewer-note flex items-center gap-2.5 p-3 rounded-xl bg-muted text-xs text-muted-foreground">
          <Icon name="shield" className="size-4 text-primary" />
          <span>
            <strong className="font-bold text-foreground">دسترسی مشاهده‌گر: </strong>
            برای بارگذاری فایل، نقش مدیر مالی یا مشاور لازم است.
          </span>
        </div>
      )}

      <div className="upload-messages space-y-2" aria-live="polite">
        {error && (
          <Alert variant="destructive" className="form-error text-xs p-3" role="alert">
            {error}
          </Alert>
        )}
        {notice && (
          <Alert className="form-success text-xs p-3 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
            {notice}
          </Alert>
        )}
      </div>

      <div className="imports-list space-y-3" aria-label="فایل‌های اخیر">
        <div className="list-title flex items-center justify-between border-b border-border/60 pb-2">
          <strong className="text-xs font-bold text-foreground">فایل‌های اخیر</strong>
          <span className="text-[11px] font-mono text-muted-foreground">
            {new Intl.NumberFormat("fa-IR").format(items.length)} مورد
          </span>
        </div>

        {!items.length ? (
          <div className="imports-empty py-8 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
            <Icon name="file" className="size-6 text-muted-foreground/60" />
            <p>هنوز فایلی برای این شرکت بارگذاری نشده است.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {items.map((item) => (
              <article className="import-row py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3" key={item.id}>
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`file-state size-9 rounded-xl flex items-center justify-center shrink-0 ${
                      item.scan_status === "clean"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : item.scan_status === "infected"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon name="file" className="size-4" />
                  </span>

                  <div className="file-info min-w-0">
                    <strong className="block text-xs font-bold text-foreground truncate">{item.original_name}</strong>
                    <small className="block text-[11px] text-muted-foreground truncate">
                      {item.source_label} · {formatBytes(item.size_bytes)} ·{" "}
                      {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(
                        new Date(item.created_at)
                      )}
                    </small>
                    {item.duplicate_detected && (
                      <span className="duplicate-note block text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                        نسخه‌ای با محتوای یکسان قبلاً ثبت شده است.
                      </span>
                    )}
                    {item.failure_message && (
                      <span className="failure-note block text-[10px] text-destructive mt-0.5">{item.failure_message}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                  <div className="file-progress flex flex-col items-end gap-1">
                    <Badge variant="outline" className={`status text-[11px] ${statusBadgeClasses[item.status]}`}>
                      {importStatusLabels[item.status]}
                    </Badge>
                    {["uploaded", "inspecting"].includes(item.status) && (
                      <Progress className="progress-track w-20 h-1.5" value={item.progress} />
                    )}
                  </div>

                  <div className="import-actions flex items-center gap-1.5">
                    {item.scan_status === "clean" && (
                      <Button asChild variant="outline" size="sm" className="prepare-link h-8 text-xs gap-1.5">
                        <Link href={`/companies/${company.id}/imports/${item.id}`}>
                          <Icon name="table" className="size-3.5" />
                          <span>{item.stage === "normalized" ? "مشاهده" : "آماده‌سازی"}</span>
                        </Link>
                      </Button>
                    )}

                    {item.scan_status === "clean" ? (
                      <Button asChild variant="ghost" size="icon" className="download-button size-8" title={`دریافت ${item.original_name}`}>
                        <a href={`${API_URL}/companies/${company.id}/imports/${item.id}/download`}>
                          <Icon name="download" className="size-3.5" />
                          <span className="sr-only">دریافت {item.original_name}</span>
                        </a>
                      </Button>
                    ) : (
                      <span className="download-placeholder size-8" aria-hidden="true" />
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
                        <span className="sr-only">حذف {item.original_name}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <Dialog open={batchToDelete !== null} onOpenChange={(open) => { if (!open && !deleting) setBatchToDelete(null); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Icon name="trash" className="size-5 text-destructive" />
              حذف سند مالی
            </DialogTitle>
            <DialogDescription>
              آیا از حذف فایل «<strong className="text-foreground">{batchToDelete?.original_name}</strong>» اطمینان دارید؟ تمامی ردیف‌ها و داده‌های استخراج‌شده از این سند به طور کامل حذف خواهند شد. این عملیات غیرقابل بازگشت است.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBatchToDelete(null)}
              disabled={deleting}
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
            </ProductCard>
          </TabsContent>

          <TabsContent value="classification" className="m-0 focus-visible:outline-none">
            <FinancialModelWorkspace company={company} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
