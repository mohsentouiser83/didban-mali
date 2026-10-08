"use client";

import Link from "next/link";
import { Clock, RefreshCw } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { toPersianDigits } from "@/components/ui/financial";

interface DataStalenessBannerProps {
  companyId: string;
  lastUpdatedDaysAgo?: number;
  lastUpdatedDateFa?: string;
}

export function DataStalenessBanner({
  companyId,
  lastUpdatedDaysAgo = 4,
  lastUpdatedDateFa,
}: DataStalenessBannerProps) {
  // Only show warning if data is older than 3 days
  if (lastUpdatedDaysAgo <= 3) {
    return null;
  }

  return (
    <div
      dir="rtl"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ds-warning/20 bg-ds-warning/10 px-4 py-2.5 text-xs text-ds-warning"
    >
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-ds-warning shrink-0" />
        <span>
          <strong>هشدار تازگی داده:</strong> آخرین اطلاعات بانکی و اسناد مالی
          مربوط به{" "}
          <strong>{toPersianDigits(lastUpdatedDaysAgo)} روز قبل</strong>{" "}
          {lastUpdatedDateFa ? `(${lastUpdatedDateFa})` : ""} است. جهت دریافت
          بینش دقیق، داده‌های جدید را بارگذاری نمایید.
        </span>
      </div>

      <Button
        asChild
        size="sm"
        variant="outline"
        className="gap-1.5 border-ds-warning/30 hover:bg-ds-warning/20 text-ds-warning"
      >
        <Link href={`/companies/${companyId}/data`}>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>به‌روزرسانی داده‌ها</span>
        </Link>
      </Button>
    </div>
  );
}
