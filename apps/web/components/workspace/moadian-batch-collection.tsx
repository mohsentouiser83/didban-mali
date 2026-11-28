"use client";

import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/content-states";
import {
  Table,
  TableBody,
  TableCell,
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
  const unsent = items.filter((item) => item.moadian_status === "not_sent");
  const firstSelected = unsent.find((item) => selectedIds.includes(item.id));

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id),
    );
  };

  const selectAllUnsent = () => {
    setSelectedIds(unsent.map((item) => item.id));
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
          <Button variant="secondary" onClick={selectAllUnsent} disabled={!unsent.length}>
            انتخاب همه ارسال‌نشده‌ها
          </Button>
          {firstSelected && (
            <Button onClick={() => {
              toggleSelect(firstSelected.id, false);
              onSelectForTransmission(firstSelected.id);
            }}>
              بازبینی بعدی از انتخاب‌شده‌ها
            </Button>
          )}
          {selectedIds.length > 0 && (
            <Button variant="ghost" onClick={clearSelection}>
              لغو انتخاب ({persian(selectedIds.length)})
            </Button>
          )}
        </div>
      }
    >
      {candidatesResource.loading ? (
        <LoadingState label="در حال بارگذاری فاکتورهای فروش..." />
      ) : candidatesResource.error ? (
        <ErrorState message={candidatesResource.error.message} onRetry={candidatesResource.refresh} />
      ) : !items.length ? (
        <EmptyState title="فاکتور فروشی برای ارسال یافت نشد" />
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
              const eligible = row.moadian_status === "not_sent";
              return (
                <TableRow key={row.id} className={isSelected ? "bg-primary-soft/30" : undefined}>
                  <TableCell>
                    <Checkbox
                      id={`select-${row.id}`}
                      label={`انتخاب ${row.reference}`}
                      hideLabel
                      disabled={!eligible}
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
                    <TableRowActions label={`عملیات ${row.reference}`}>
                      <TableRowAction
                        disabled={!eligible}
                        onClick={() => onSelectForTransmission(row.id)}
                      >
                        آماده‌سازی ارسال
                      </TableRowAction>
                    </TableRowActions>
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
