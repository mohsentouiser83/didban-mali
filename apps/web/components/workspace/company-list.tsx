"use client";
import { CheckIcon, BuildingsIcon, ArrowsLeftRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type Company } from "@/lib/api";
import { Panel } from "./page-parts";

export function CompanyList({ companies, activeId, onSelect }: { companies: Company[]; activeId?: string; onSelect: (id: string) => void }) {
  if (!companies.length) return null;
  return (
    <Panel title="شرکت‌های تحت پوشش">
      <ul className="divide-y divide-border">
        {companies.map((company) => (
          <li key={company.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <BuildingsIcon size={22} className="shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 wrap-anywhere font-medium">{company.name}</span>
            </div>
            {company.id === activeId ? (
              <Badge tone="success"><CheckIcon size={16} aria-hidden />شرکت فعال</Badge>
            ) : (
              <Button variant="secondary" aria-label={`انتخاب ${company.name}`} onClick={() => onSelect(company.id)}><ArrowsLeftRightIcon size={18} aria-hidden className="text-primary" />انتخاب شرکت</Button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
