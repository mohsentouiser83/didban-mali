"use client";
import { StatusBadge } from "@/components/ui/financial/status-badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toJalaliDate } from "@/components/ui/financial";
import { settlementInvoiceStatus, settlementMoney as money, type SettlementInvoice } from "@/lib/settlements";

type Props = { invoices: SettlementInvoice[]; onInspect: (id: string) => void };
export function SettlementInvoiceList({ invoices, onInspect }: Props) {
  return <section aria-label="فاکتورهای قابل بررسی" className="min-w-0">
    <ul className="space-y-3 xl:hidden">{invoices.map((i) => <li key={i.key} className="space-y-4 rounded-[var(--ds-card-radius)] border border-border bg-card p-4 text-sm">
      <div className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words font-medium leading-relaxed">{i.party_name || "طرف حساب نامشخص"}</h2><StatusBadge status={settlementInvoiceStatus(i)} /></div>
      <p dir="ltr" className="break-all text-end text-xs text-muted-foreground">{i.number}</p>
      <dl className="grid grid-cols-2 gap-4"><div><dt className="text-muted-foreground">مبلغ فاکتور</dt><dd className="mt-1 tabular-nums">{money(i.gross_amount_irr)} ریال</dd></div><div><dt className="text-muted-foreground">تخصیص بانک</dt><dd className="mt-1 tabular-nums">{money(i.allocated_amount_irr)} ریال</dd></div></dl>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><span className="text-muted-foreground">{toJalaliDate(i.issue_date)}</span><Button variant="outline" onClick={() => onInspect(i.source_row_id)}>بررسی</Button></div>
    </li>)}</ul>
    <div className="hidden overflow-hidden rounded-[var(--ds-card-radius)] border border-border bg-card xl:block"><div className="min-w-0"><Table className="min-w-[760px]" containerClassName="border-0"><TableHeader className="bg-muted text-muted-foreground"><TableRow>{["طرف حساب / فاکتور", "تاریخ", "مبلغ (ریال)", "تخصیص بانک (ریال)", "وضعیت", "عملیات"].map((label) => <TableHead key={label} className="px-4 py-3 text-start font-medium">{label}</TableHead>)}</TableRow></TableHeader><TableBody>{invoices.map((i) => <TableRow key={i.key} className="border-t border-border"><TableCell className="max-w-64 px-4 py-3"><span className="block break-words font-medium">{i.party_name || "طرف حساب نامشخص"}</span><span dir="ltr" className="mt-1 block truncate text-end text-xs text-muted-foreground">{i.number}</span></TableCell><TableCell className="px-4 py-3">{toJalaliDate(i.issue_date)}</TableCell><TableCell className="px-4 py-3 tabular-nums">{money(i.gross_amount_irr)}</TableCell><TableCell className="px-4 py-3 tabular-nums">{money(i.allocated_amount_irr)}</TableCell><TableCell className="px-4 py-3"><StatusBadge status={settlementInvoiceStatus(i)} /></TableCell><TableCell className="px-4 py-3"><Button variant="outline" onClick={() => onInspect(i.source_row_id)}>بررسی</Button></TableCell></TableRow>)}</TableBody></Table></div></div>
  </section>;
}
