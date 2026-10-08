"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Company, ImportBatch, ImportStatus } from "@/lib/product-types";
import { API_URL, api } from "@/lib/product-api";
import {
  BookOpen,
  Download,
  FileText,
  Landmark,
  Receipt,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  ExternalLink,
} from "@/components/ui/icons";

interface DataHistoryTabProps {
  company: Company;
  items: ImportBatch[];
  loading: boolean;
  onRefresh: () => void;
  onSelectBatchForReview?: (batchId: string) => void;
}

const sourceLabels = {
  accounting: "حسابداری",
  bank: "گردش بانکی",
  sales: "فروش و صورتحساب",
};

const sourceIcons = {
  accounting: BookOpen,
  bank: Landmark,
  sales: Receipt,
};

const statusLabels: Record<ImportStatus, string> = {
  uploaded: "دریافت شد",
  inspecting: "بررسی امنیتی",
  awaiting_mapping: "آمادهٔ تطبیق",
  validating: "اعتبارسنجی",
  queued: "در صف پردازش",
  processing: "در حال پردازش",
  completed: "تکمیل‌شده",
  completed_limited: "تکمیل با هشدار",
  failed: "رد شده",
  cancelled: "لغوشده",
};

const statusBadges: Record<ImportStatus, string> = {
  uploaded: "bg-muted text-muted-foreground border-border",
  inspecting: "bg-primary/10 text-primary border-primary/20",
  awaiting_mapping: "bg-primary/10 text-primary border-primary/20",
  validating: "bg-primary/10 text-primary border-primary/20",
  queued: "bg-muted text-muted-foreground border-border",
  processing: "bg-primary/10 text-primary border-primary/20 animate-pulse",
  completed: "bg-ds-success/10 text-ds-success border-ds-success/20",
  completed_limited: "bg-ds-warning/10 text-ds-warning border-ds-warning/20",
  failed: "bg-ds-danger/10 text-ds-danger border-ds-danger/20",
  cancelled: "bg-muted text-muted-foreground border-border",
};

export function DataHistoryTab({
  company,
  items,
  loading,
  onRefresh,
  onSelectBatchForReview,
}: DataHistoryTabProps) {
  const [batchToDelete, setBatchToDelete] = useState<ImportBatch | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState("");
  const canDelete =
    company.role === "owner" || company.role === "finance_manager";

  async function confirmDelete() {
    if (!batchToDelete) return;
    setDeleting(true);
    setActionError("");
    try {
      await api(`/companies/${company.id}/imports/${batchToDelete.id}`, {
        method: "DELETE",
      });
      setBatchToDelete(null);
      onRefresh();
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : "حذف بارگذاری انجام نشد.",
      );
    } finally {
      setDeleting(false);
    }
  }

  function downloadOriginal(batch: ImportBatch) {
    window.open(
      `${API_URL}/companies/${company.id}/imports/${batch.id}/download`,
      "_blank",
    );
  }

  return (
    <div className="pp-data-history space-y-4" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">
            تاریخچه اسناد و بسته‌های داده
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            ثبت ممیزی کامل تمام فایل‌های واردشده، تعداد رکوردهای پذیرفته‌شده و
            ردشده، و وضعیت پردازش
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="gap-1.5 self-start sm:self-center"
        >
          <RefreshCw className="size-3.5" />
          <span>به‌روزرسانی فهرست</span>
        </Button>
      </div>

      {actionError && (
        <div className="p-3 text-xs rounded-[var(--ds-card-radius)] bg-destructive/10 text-destructive border border-destructive/20">
          {actionError}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="py-16 text-center text-xs text-muted-foreground">
          در حال دریافت تاریخچه بارگذاری‌ها…
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center rounded-[var(--ds-card-radius)] border border-dashed border-border space-y-2">
          <FileText className="size-8 text-muted-foreground mx-auto" />
          <h4 className="text-sm font-bold text-foreground">
            هنوز هیچ فایلی بارگذاری نشده است
          </h4>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            برای شروع، از تب «بارگذاری داده» نخستین فایل حسابداری، بانکی یا فروش
            خود را وارد کنید.
          </p>
        </div>
      ) : (
        <div className="rounded-[var(--ds-card-radius)] border border-border bg-card overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="text-start font-bold">
                    نام فایل و منبع
                  </TableHead>
                  <TableHead className="text-start font-bold">وضعیت</TableHead>
                  <TableHead className="text-center font-bold">
                    پذیرفته‌شده
                  </TableHead>
                  <TableHead className="text-center font-bold">ردشده</TableHead>
                  <TableHead className="text-start font-bold">
                    تاریخ بارگذاری
                  </TableHead>
                  <TableHead className="text-start font-bold">
                    هش امنیتی (SHA-256)
                  </TableHead>
                  <TableHead className="text-end font-bold">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60">
                {items.map((item) => {
                  const IconComp = sourceIcons[item.source_kind] || BookOpen;
                  const label =
                    sourceLabels[item.source_kind] || item.source_kind;
                  const isAccepted =
                    item.accepted_count && item.accepted_count > 0;

                  return (
                    <TableRow
                      key={item.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <IconComp className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <strong
                              className="block truncate font-bold text-foreground max-w-[200px] sm:max-w-xs"
                              dir="ltr"
                            >
                              {item.original_name}
                            </strong>
                            <span className="text-[11px] text-muted-foreground block truncate">
                              {label} · {item.source_label}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="py-3">
                        <Badge
                          variant="outline"
                          className={`text-[11px] py-0.5 px-2 ${statusBadges[item.status] || "bg-muted"}`}
                        >
                          {statusLabels[item.status] || item.status}
                        </Badge>
                      </TableCell>

                      <TableCell className="py-3 text-center font-mono font-bold text-ds-success">
                        {item.accepted_count
                          ? item.accepted_count.toLocaleString("fa-IR")
                          : "۰"}
                      </TableCell>

                      <TableCell className="py-3 text-center font-mono font-bold">
                        {item.rejected_count && item.rejected_count > 0 ? (
                          <span className="text-ds-danger">
                            {item.rejected_count.toLocaleString("fa-IR")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">۰</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3 text-muted-foreground text-[11px] whitespace-nowrap">
                        {new Date(item.created_at).toLocaleDateString("fa-IR", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>

                      <TableCell
                        className="py-3 font-mono text-[10px] text-muted-foreground max-w-[120px] truncate"
                        dir="ltr"
                      >
                        {item.sha256 ? `${item.sha256.slice(0, 12)}…` : "—"}
                      </TableCell>

                      <TableCell className="py-3 text-end">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-foreground"
                            onClick={() => downloadOriginal(item)}
                            title="دانلود فایل اصلی"
                          >
                            <Download className="size-3.5" />
                          </Button>

                          {onSelectBatchForReview && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground"
                              onClick={() => onSelectBatchForReview(item.id)}
                              title="مشاهده جزییات و نگاشت"
                            >
                              <ExternalLink className="size-3.5" />
                            </Button>
                          )}

                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setBatchToDelete(item)}
                              title="حذف و لغو سند"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(batchToDelete)}
        onOpenChange={(o) => !o && setBatchToDelete(null)}
      >
        <DialogContent
          className="sm:max-w-md rounded-[var(--ds-card-radius)]"
          dir="rtl"
        >
          <DialogHeader className="text-start">
            <DialogTitle className="text-sm font-bold text-foreground">
              تأیید لغو و حذف سند مالی
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              آیا از حذف فایل «{batchToDelete?.original_name}» اطمینان دارید؟ با
              حذف این فایل، تمام رکوردهای کانونیکال مرتبط به صورت ممیزی‌شده
              برگشت خواهند خورد.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              variant="destructive"
              size="sm"
              className=""
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? "در حال حذف…" : "بله، حذف و برگشت سند"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className=""
              onClick={() => setBatchToDelete(null)}
            >
              انصراف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
