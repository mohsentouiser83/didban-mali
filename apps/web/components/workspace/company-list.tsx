"use client";
import {
  CheckIcon,
  BuildingsIcon,
  ArrowsLeftRightIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type Company } from "@/lib/api";
import { memberRoles } from "@/lib/members";
import { Panel } from "./page-parts";

export function CompanyList({
  companies,
  activeId,
  onSelect,
  onManage,
}: {
  companies: Company[];
  activeId?: string;
  onSelect: (id: string) => void;
  onManage?: (id: string) => void;
}) {
  if (!companies.length) return null;
  return (
    <Panel title="شرکت‌های تحت پوشش">
      <ul className="divide-y divide-border">
        {companies.map((company) => {
          const isActive = company.id === activeId;
          const roleLabel =
            memberRoles.find((r) => r.value === company.role)?.label ?? company.role;
          return (
            <li
              key={company.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <BuildingsIcon
                  size={22}
                  className="shrink-0 text-primary"
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 wrap-anywhere font-medium">
                      {company.name}
                    </span>
                    <Badge tone="neutral">{roleLabel}</Badge>
                    {isActive && (
                      <Badge tone="success">
                        <CheckIcon size={14} aria-hidden />
                        شرکت فعال
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!isActive && (
                  <Button
                    variant="secondary"
                    aria-label={`انتخاب ${company.name} به‌عنوان شرکت فعال`}
                    onClick={() => onSelect(company.id)}
                  >
                    <ArrowsLeftRightIcon
                      size={16}
                      aria-hidden
                      className="text-primary"
                    />
                    انتخاب شرکت فعال
                  </Button>
                )}
                {onManage && (
                  <Button
                    variant="ghost"
                    aria-label={`مشاهده و مدیریت ${company.name}`}
                    onClick={() => onManage(company.id)}
                  >
                    {company.role === "owner" ? "مدیریت مشخصات" : "مشاهده مشخصات"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
