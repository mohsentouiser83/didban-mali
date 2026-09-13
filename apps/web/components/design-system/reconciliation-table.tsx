"use client";

import { type ColumnDef, flexRender, getCoreRowModel, getSortedRowModel, type SortingState, useReactTable } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Match = { id: string; description: string; account: string; amount: number; status: "matched" | "review" | "open" };

const rows: Match[] = [
  { id: "TX-10482", description: "واریز درگاه فروش", account: "1102-04", amount: 1485000000, status: "matched" },
  { id: "TX-10479", description: "کارمزد خدمات بانکی", account: "5208-01", amount: -18300000, status: "review" },
  { id: "TX-10471", description: "تسویه مشتری سازمانی", account: "1102-04", amount: 824000000, status: "matched" },
  { id: "TX-10466", description: "برداشت بدون شرح", account: "2101-09", amount: -96500000, status: "open" },
];

const currency = new Intl.NumberFormat("fa-IR");
const status = {
  matched: { label: "تطبیق‌شده", variant: "success" as const },
  review: { label: "نیازمند بررسی", variant: "warning" as const },
  open: { label: "باز", variant: "danger" as const },
};

const columns: ColumnDef<Match>[] = [
  { accessorKey: "id", header: "شناسه", cell: ({ row }) => <span className="ds-latin text-xs text-[var(--ds-foreground-soft)]">{row.original.id}</span> },
  { accessorKey: "description", header: "شرح تراکنش", cell: ({ row }) => <span className="font-medium">{row.original.description}</span> },
  { accessorKey: "account", header: "کد حساب", cell: ({ row }) => <span className="ds-latin text-xs">{row.original.account}</span> },
  { accessorKey: "amount", header: ({ column }) => <Button variant="ghost" size="sm" className="-ms-3" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>مبلغ <ArrowUpDown /></Button>, cell: ({ row }) => <span className={`ds-persian-numerals font-bold ${row.original.amount < 0 ? "text-[var(--ds-danger)]" : "text-[var(--ds-success)]"}`}>{currency.format(row.original.amount)} <small className="font-normal">ریال</small></span> },
  { accessorKey: "status", header: "وضعیت", cell: ({ row }) => <Badge variant={status[row.original.status].variant}>{status[row.original.status].label}</Badge> },
];

export function ReconciliationTable() {
  const [sorting, setSorting] = useState<SortingState>([]);
  // TanStack Table intentionally returns non-memoizable functions; React Compiler skips this hook safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: rows, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  return <Table aria-label="نمونه جدول تطبیق تراکنش‌ها"><TableHeader>{table.getHeaderGroups().map((group) => <TableRow key={group.id}>{group.headers.map((header) => <TableHead key={header.id}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader><TableBody>{table.getRowModel().rows.map((row) => <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody></Table>;
}
