"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReviewDirection, ReviewDirectionCounts } from "@/lib/review";

const options: { value: ReviewDirection; label: string }[] = [
  { value: "all", label: "همه موارد" },
  { value: "suggested", label: "دارای پیشنهاد تطبیق" },
  { value: "matched", label: "تطبیق تأییدشده" },
  { value: "missing_accounting", label: "بانک؛ بدون پیشنهاد" },
  { value: "missing_bank", label: "حسابداری؛ بدون پیشنهاد" },
];

export function ReviewDirectionFilters({ value, counts, loading, onChange }: {
  value: ReviewDirection;
  counts?: ReviewDirectionCounts;
  loading: boolean;
  onChange: (value: ReviewDirection) => void;
}) {
  return <div role="group" aria-label="نتیجه بررسی تطبیق" className="flex flex-wrap gap-2 border-t border-border px-4 py-4 sm:px-6">
    {options.map((option) => <Button key={option.value} variant={value === option.value ? "secondary" : "outline"}
      aria-label={`${option.label}${!loading && counts ? `، ${(counts[option.value] ?? 0).toLocaleString("fa-IR")} ردیف` : ""}`}
      aria-pressed={value === option.value} onClick={() => onChange(option.value)}
      className={`h-auto min-h-11 max-w-full justify-start whitespace-normal border px-3 py-2 text-start text-sm transition-colors motion-reduce:transition-none ${value === option.value ? "border-primary/30 text-primary" : "border-border"}`}>
      <Check size={16} aria-hidden="true" className={`shrink-0 transition-[opacity,transform] duration-150 motion-reduce:transition-none ${value === option.value ? "scale-100 opacity-100" : "scale-75 opacity-0"}`} />
      <span>{option.label}</span>
      {loading ? <Skeleton className="h-5 w-8 shrink-0" /> : <Badge variant="secondary" size="xs" className="ms-auto tabular-nums">{counts ? (counts[option.value] ?? 0).toLocaleString("fa-IR") : "—"}</Badge>}
    </Button>)}
  </div>;
}
