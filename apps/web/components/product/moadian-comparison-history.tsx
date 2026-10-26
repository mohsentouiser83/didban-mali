"use client";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableRowHeader } from "@/components/ui/table";
import { toJalaliDate } from "@/components/ui/financial";
import type { ComparisonHistory } from "@/lib/moadian";

export function MoadianComparisonHistory({ runs, busy, onOpen }: { runs: ComparisonHistory[]; busy: boolean; onOpen: (id: string) => void }) {
  return <section aria-label="تطبیق‌های ذخیره‌شده" className="min-w-0 space-y-4">
    <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">تطبیق‌های ذخیره‌شده</h2>
    <Table><TableHeader><TableRow><TableHead>نوع</TableHead><TableHead>بازه تطبیق</TableHead><TableHead className="hidden sm:table-cell">تاریخ اجرا</TableHead><TableHead><span className="sr-only">گزارش</span></TableHead></TableRow></TableHeader>
      <TableBody>{runs.map((run) => <TableRow key={run.id}><TableRowHeader>{run.direction === "sales" ? "فروش" : "خرید"}</TableRowHeader><TableCell className="whitespace-normal"><span className="inline-block">{toJalaliDate(run.start_date)}</span><span className="mx-1">تا</span><span className="inline-block">{toJalaliDate(run.end_date)}</span></TableCell><TableCell className="hidden sm:table-cell">{toJalaliDate(run.created_at)}</TableCell><TableCell><Button size="sm" variant="outline" disabled={busy} onClick={() => onOpen(run.id)}>مشاهده نتیجه</Button></TableCell></TableRow>)}</TableBody>
    </Table>
  </section>;
}
