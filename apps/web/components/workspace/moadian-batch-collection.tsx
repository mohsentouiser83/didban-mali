"use client";

import { useMemo, useState } from "react";
import { CheckSquareIcon, PlusIcon, ReceiptIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/content-states";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import { amount, displayDate, persian } from "@/lib/utils";
import { Panel } from "./page-parts";

interface CandidateInvoice {
  id: string;
  version: number;
  reference: string;
  date: string;
  amount: string;
  party_id: string;
  moadian_status: string;
  can_send: boolean;
}

const statusLabels: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "primary" }> = {
  not_sent: { label: "ارسال‌نشده", tone: "neutral" },
  queued: { label: "در صف ارسال", tone: "primary" },
  sent: { label: "ارسال‌شده / در انتظار استعلام", tone: "warning" },
  success: { label: "ارسال موفق", tone: "success" },
  failed: { label: "خطا در ارسال", tone: "danger" },
};

export function MoadianBatchCollection({
  onSelectForTransmission,
}: {
  onSelectForTransmission: (invoiceId: string) => void;
}) {
  const workspace = useWorkspace();
  const base = workspace.companyPath("moadian/transmissions");
  const candidatesResource = useResource<{ items: CandidateInvoice[] }>(
    base ? `${base}/candidates?include_all=true` : null,
  );

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const items = candidatesResource.data?.items ?? [];

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id),
    );
  };

  const selectAllUnsent = () => {
    const unsent = items.filter((i) => i.moadian_status === "not_sent").map((i) => i.id);
    setSelectedIds(unsent);
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  return (
    <Panel
      title="جمع‌آوری و انتخاب فاکتورهای فروش برای ارسال به سامانه مؤدیان"
      className="space-y-4"
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={selectAllUnsent} disabled={!items.length}>
            انتخاب همه ارسال‌نشده‌ها
          </Button>
          {selectedIds.length > 0 && (
            <Button variant="ghost" onClick={clearSelection}>
              لغو انتخاب ({persian(selectedIds.length)})
            </Button>
          )}
        </div>
      }
    >
      <p className="text-xs text-muted leading-relaxed">
        تمام فاکتورهای فروش ثبت‌شده در سامانه در جدول زیر گردآوری شده‌اند. می‌توانید مشخص کنید کدام فاکتورها باید به کارپوشه مالیاتی مؤدیان ارسال شوند و کدام‌ها ارسال نشوند:
      </p>

      {candidatesResource.loading ? (
        <LoadingState label="در حال بارگذاری فاکتورهای فروش..." />
      ) : candidatesResource.error ? (
        <ErrorState message={candidatesResource.error.message} onRetry={candidatesResource.refresh} />
      ) : !items.length ? (
        <TableEmptyCell colSpan={7} title="فاکتور فروشی برای ارسال یافت نشد" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">انتخاب</TableHead>
              <TableHead>شماره فاکتور</TableHead>
              <TableHead>طرف‌حساب (خریدار)</TableHead>
              <TableHead>تاریخ صدور</TableHead>
              <TableHead numeric>مبلغ کل (ریال)</TableHead>
              <TableHead>وضعیت سامانه مؤدیان</TableHead>
              <TableHead>عملیات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => {
              const status = statusLabels[row.moadian_status] || statusLabels.not_sent;
              const isSelected = selectedIds.includes(row.id);
              return (
                <TableRow key={row.id} className={isSelected ? "bg-primary-soft/30" : undefined}>
                  <TableCell>
                    <Checkbox
                      id={`select-${row.id}`}
                      label={`انتخاب ${row.reference}`}
                      hideLabel
                      checked={isSelected}
                      onCheckedChange={(checked) => toggleSelect(row.id, Boolean(checked))}
                    />
                  </TableCell>
                  <TableRowHeader>
                    <bdi>{row.reference}</bdi>
                  </TableRowHeader>
                  <TableCell>{row.party_id}</TableCell>
                  <TableCell>{displayDate(row.date)}</TableCell>
                  <TableCell numeric className="tabular-nums font-medium">
                    {amount(row.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="secondary"
                      className="text-xs h-8"
                      onClick={() => onSelectForTransmission(row.id)}
                    >
                      آماده‌سازی ارسال
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
