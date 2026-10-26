"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "@/components/ui/table";
import { toPersianDigits } from "@/components/ui/financial";
import type { InvoiceSnapshot } from "@/lib/moadian";
import type { ImportBatch } from "@/lib/product-types";

export function ComparisonProvenance({ invoice, batches }: { invoice: InvoiceSnapshot; batches: ImportBatch[] }) {
  const [page, setPage] = useState(0);
  const rows = invoice.source_rows ?? [];
  if (rows.length < 2) return null;
  return <section className="grid gap-3"><h4 className="text-sm font-medium">ردیف‌های منبع ({toPersianDigits(rows.length)})</h4>
    <Table className="min-w-0 table-fixed"><TableHeader><TableRow><TableHead>فایل</TableHead><TableHead>شیت / ردیف</TableHead></TableRow></TableHeader><TableBody>
      {rows.slice(page * 10, (page + 1) * 10).map((row) => <TableRow key={row.row_id}><TableCell className="whitespace-normal break-words">{batches.find((b) => b.id === row.batch_id)?.original_name ?? "فایل منبع"}</TableCell><TableCell className="whitespace-normal">{row.sheet} / {toPersianDigits(row.row_number)}</TableCell></TableRow>)}
    </TableBody></Table>
    {rows.length > 10 && <nav aria-label="ردیف‌های منبع" className="flex gap-2"><Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>قبلی</Button><Button variant="outline" disabled={(page + 1) * 10 >= rows.length} onClick={() => setPage(page + 1)}>بعدی</Button></nav>}
  </section>;
}
