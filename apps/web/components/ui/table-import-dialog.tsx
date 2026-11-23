"use client";

import { useState, useRef, useContext, type DragEvent, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Drawer } from "./drawer";
import { Button } from "./button";
import {
  UploadSimpleIcon,
  FileXlsIcon,
  TableIcon,
  CheckCircleIcon,
  ArrowsClockwiseIcon,
  ClipboardTextIcon,
} from "@phosphor-icons/react";
import { persian } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { TableImportArchiveContext } from "@/hooks/table-import-archive";

export interface ParsedTableImport {
  headers: string[];
  rows: (string | number)[][];
  totalRows: number;
  file?: File;
}

export interface TableImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (data: ParsedTableImport) => void | Promise<void>;
  archiveOriginal: boolean;
  title?: string;
}

export function TableImportDialog({
  open,
  onOpenChange,
  onImport,
  archiveOriginal,
  title = "ورود اطلاعات از اکسل (Excel / CSV)",
}: TableImportDialogProps) {
  const archive = useContext(TableImportArchiveContext);
  const submitting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [parsedData, setParsedData] = useState<ParsedTableImport | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    if (submitting.current) return;
    setParsedData(null);
    setSelectedFile(null);
    setPastedText("");
    setIsProcessing(false);
  };

  const handleClose = () => {
    if (submitting.current) return;
    resetState();
    onOpenChange(false);
  };

  const processWorkbook = (workbook: XLSX.WorkBook, sourceFile?: File) => {
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      toast.error("فایل اکسل حاوی هیچ برگه‌ای نیست.");
      return;
    }
    const worksheet = workbook.Sheets[firstSheetName];
    // Read as 2D array
    const rawData = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, {
      header: 1,
      defval: "",
    });

    if (!rawData || !rawData.length) {
      toast.error("هیچ داده‌ای در فایل اکسل یافت نشد.");
      return;
    }

    // First non-empty row as headers
    const headerRowIndex = rawData.findIndex((r) => r && r.length > 0 && r.some((c) => String(c).trim() !== ""));
    if (headerRowIndex === -1) {
      toast.error("ردیف عنوان ستون‌ها یافت نشد.");
      return;
    }

    const headers = rawData[headerRowIndex].map((h, i) => String(h || "").trim() || `ستون ${persian(i + 1)}`);
    const rows = rawData
      .slice(headerRowIndex + 1)
      .filter((r) => r && r.length > 0 && r.some((c) => String(c).trim() !== ""))
      .map((r) => headers.map((_, i) => r[i] ?? ""));

    if (!rows.length) {
      toast.warning("عنوان ستون‌ها شناسایی شد اما ردیف داده‌ای یافت نشد.");
    }

    const fileToAttach = sourceFile || selectedFile || undefined;
    setParsedData({
      headers,
      rows,
      totalRows: rows.length,
      file: fileToAttach,
    });
    toast.success(`${persian(rows.length)} ردیف و ${persian(headers.length)} ستون شناسایی شد.`);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (submitting.current) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: "array" });
        processWorkbook(workbook, file);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطا در خواندن فایل";
        toast.error(`خطا در پردازش فایل: ${msg}`);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.onerror = () => {
      toast.error("خطا در بارگذاری فایل.");
      setIsProcessing(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (submitting.current) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext || "")) {
      toast.error("تنها فایل‌های اکسل (.xlsx, .xls) یا CSV مجاز هستند.");
      return;
    }

    setSelectedFile(file);
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: "array" });
        processWorkbook(workbook, file);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطا در خواندن فایل";
        toast.error(`خطا در پردازش فایل: ${msg}`);
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleProcessPastedText = () => {
    if (!pastedText.trim()) {
      toast.error("لطفاً داده‌های کپی‌شده را در کادر متنی وارد نمایید.");
      return;
    }

    try {
      const lines = pastedText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (!lines.length) {
        toast.error("متنی برای پردازش یافت نشد.");
        return;
      }

      // Check delimiter (tab or comma)
      const firstLine = lines[0];
      const delimiter = firstLine.includes("\t") ? "\t" : ",";

      const headers = firstLine.split(delimiter).map((h, i) => h.trim() || `ستون ${persian(i + 1)}`);
      const rows = lines.slice(1).map((line) => {
        const parts = line.split(delimiter);
        return headers.map((_, i) => parts[i]?.trim() ?? "");
      });

      setParsedData({
        headers,
        rows,
        totalRows: rows.length,
      });
      toast.success(`${persian(rows.length)} ردیف با موفقیت پردازش شد.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در پردازش متن";
      toast.error(`خطا: ${msg}`);
    }
  };

  const handleConfirm = async () => {
    if (!parsedData || submitting.current) return;
    submitting.current = true;
    setIsSubmitting(true);
    try {
      if (archiveOriginal && archive && parsedData.file) await archive(parsedData.file);
      await onImport(parsedData);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "ورود فایل انجام نشد.");
      return;
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
    handleClose();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
      title={title}
      description="فایل اکسل یا CSV را بارگذاری نمایید یا ستون‌های کپی‌شده از اکسل را بچسبانید."
      className="max-w-2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          {parsedData ? (
            <div className="flex items-center gap-2 text-xs text-muted">
              <CheckCircleIcon size={18} className="text-emerald" weight="fill" />
              <span>
                {persian(parsedData.totalRows)} ردیف و {persian(parsedData.headers.length)} ستون آماده ورود
              </span>
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleClose}>
              انصراف
            </Button>
            <Button
              variant="primary"
              disabled={!parsedData || !parsedData.rows.length}
              busy={isSubmitting}
              onClick={() => void handleConfirm()}
              className="gap-2"
            >
              <UploadSimpleIcon size={16} />
              تأیید و ورود به جدول
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Tab selection */}
        <div className="flex rounded-control border border-border bg-canvas/60 p-1">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setActiveTab("file");
              resetState();
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-colors ${
              activeTab === "file"
                ? "bg-surface text-primary shadow-xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            <FileXlsIcon size={16} />
            بارگذاری فایل اکسل (.xlsx / .csv)
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => {
              setActiveTab("paste");
              resetState();
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-colors ${
              activeTab === "paste"
                ? "bg-surface text-primary shadow-xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            <ClipboardTextIcon size={16} />
            چسباندن مستقیم از اکسل (Paste)
          </button>
        </div>

        {/* Content depending on tab */}
        {activeTab === "file" && !parsedData && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary-soft/40"
                : "border-border hover:border-primary/50 hover:bg-canvas/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
              <UploadSimpleIcon size={24} />
            </div>
            <h4 className="mt-3 text-sm font-medium text-foreground">
              {isProcessing ? "در حال پردازش فایل..." : "فایل اکسل یا CSV را اینجا بکشید یا کلیک کنید"}
            </h4>
            <p className="mt-1 text-xs text-muted">پشتیبانی از فرمت‌های XLSX، XLS و CSV</p>
          </div>
        )}

        {activeTab === "paste" && !parsedData && (
          <div className="space-y-3">
            <p className="text-xs text-muted leading-relaxed">
              ردیف‌های مورد نظر را در اکسل انتخاب، کپی (Ctrl+C) کرده و در کادر زیر بچسبانید (Ctrl+V):
            </p>
            <textarea
              dir="ltr"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="کد	نام	مبلغ	تاریخ&#10;101	شرکت الف	1200000	1403/01/01"
              rows={6}
              className="w-full rounded-control border border-border bg-canvas/30 p-3 font-mono text-xs text-foreground placeholder:text-muted/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button
              variant="secondary"
              onClick={handleProcessPastedText}
              disabled={!pastedText.trim()}
              className="w-full gap-2 text-xs"
            >
              <ArrowsClockwiseIcon size={16} />
              پردازش متن کپی‌شده
            </Button>
          </div>
        )}

        {/* Parsed data preview */}
        {parsedData && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <TableIcon size={16} className="text-primary" />
                <span>پیش‌نمایش داده‌های خوانده‌شده ({persian(parsedData.totalRows)} ردیف)</span>
              </div>
              <Button
                variant="ghost"
                onClick={resetState}
                className="h-7 text-[11px] text-muted hover:text-danger"
              >
                انتخاب مجدد فایل
              </Button>
            </div>

            <div className="max-h-56 overflow-auto rounded-lg border border-border bg-surface">
              <table className="w-full text-start text-xs border-collapse">
                <thead className="sticky top-0 bg-canvas text-muted">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium text-[11px] border-b border-border w-10">#</th>
                    {parsedData.headers.map((h, i) => (
                      <th
                        key={i}
                        className="px-3 py-2 text-start font-medium text-[11px] border-b border-border whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsedData.rows.slice(0, 8).map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-canvas/40">
                      <td className="px-3 py-2 text-muted text-[11px]">{persian(rIdx + 1)}</td>
                      {parsedData.headers.map((_, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 text-foreground whitespace-nowrap">
                          {String(row[cIdx] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {parsedData.totalRows > 8 && (
              <p className="text-center text-[11px] text-muted">
                و {persian(parsedData.totalRows - 8)} ردیف دیگر...
              </p>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
