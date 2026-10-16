"use client";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { Check } from "@/components/ui/icons";
import { toPersianDigits } from "@/components/ui/financial";
import { comparisonFilters, type ComparisonReport, type ComparisonStatus } from "@/lib/moadian";

export function MoadianResultFilters({ status, counts, onChange }: {
  status: ComparisonStatus | "all"; counts?: ComparisonReport["counts"]; onChange: (status: ComparisonStatus | "all") => void;
}) {
  const filters = comparisonFilters(counts);
  return <div role="group" aria-label="فیلتر نتیجه تطبیق" className="flex flex-wrap gap-2">{filters.map(({ value, label, count }) => <Button key={value} variant={status === value ? "secondary" : "outline"} aria-pressed={status === value} onClick={() => onChange(value)} className={`h-auto min-h-11 whitespace-normal px-3 py-2 text-xs transition-colors motion-reduce:transition-none ${status === value ? "border border-primary/30 text-primary" : ""}`}>
    {status === value && <Check size={14} aria-hidden="true" className="motion-safe:animate-[workspace-enter_180ms_ease-out_both]" />}{label}{count !== undefined && <Badge variant="secondary" size="xs" className="tabular-nums">{toPersianDigits(count)}</Badge>}
  </Button>)}</div>;
}
