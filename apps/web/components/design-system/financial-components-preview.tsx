"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WalletCards, Receipt, Calendar, Users } from "@/components/ui/icons";
import { FinancialDataTable, KpiMetricCard, MoneyDisplay, StatCards } from "@/components/ui/financial";

const samples = [
  { id: "1", title: "موجودی صفر", amount: "0" },
  { id: "2", title: "مانده منفی", amount: "-123456789" },
  { id: "3", title: "مبلغ بزرگ", amount: "9007199254740993123" },
];

/** Local visual examples; these controls never mutate company data. */
export function FinancialComponentsPreview() {
  const [loading, setLoading] = useState(false);
  const [descending, setDescending] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  return <section id="financial-components" className="min-w-0 space-y-6" aria-label="نمونه جدول و آمار">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[22px] font-medium">جدول و کارت‌های آماری</h2><Button variant="outline" aria-pressed={loading} onClick={() => setLoading((value) => !value)}>حالت بارگذاری</Button></div>
    <StatCards loading={loading} items={[
      { title: "مانده حساب", value: "9007199254740993123", currency: "ریال", icon: WalletCards },
      { title: "وصول امروز", value: "0", currency: "ریال", icon: Receipt },
      { title: "بدهی‌های سررسیدگذشته تأمین‌کنندگان", value: null, empty: "سررسید نامشخص", icon: Calendar },
      { title: "مانده منفی", value: "-123456789", currency: "ریال", icon: Users },
    ]} />
    <div className="grid min-w-0 gap-3 md:grid-cols-2"><KpiMetricCard title="شاخص محدود با مقدار صفر" value={0} status="limited" limitedReason="تاریخ برخی وصول‌ها ثبت نشده" loading={loading} /><KpiMetricCard title="شاخص غیرقابل محاسبه" value={null} status="limited" limitedReason="تاریخ وصول ثبت نشده" loading={loading} /></div>
    <FinancialDataTable tableAriaLabel="جدول نمونه مالی" data={descending ? [...samples].reverse() : samples} loading={loading} columns={[
      { key: "title", header: "عنوان", sortable: true },
      { key: "amount", header: "مبلغ (ریال)", numeric: true, render: (row) => <MoneyDisplay amount={row.amount} currency="" direction="neutral" size="sm" /> },
    ]} keyExtractor={(row) => row.id} selectedRowKey={selected} onRowClick={(row) => setSelected(row.id)} sortColumn="title" sortDirection={descending ? "desc" : "asc"} onSort={() => setDescending((value) => !value)} />
  </section>;
}
