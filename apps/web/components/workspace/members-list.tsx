"use client";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/content-states";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from "@/components/ui/table";
import type { useMemberManagement } from "@/hooks/use-member-management";
import {
  listItems,
  type Member,
} from "@/lib/api";
import {
  memberRoleFilterOptions,
  memberStatusFilterOptions,
} from "@/lib/members";
import type { AccountingPermission } from "@/lib/accounting";
import { persian } from "@/lib/utils";
import { Panel } from "./page-parts";

function summarizeEffectiveAuthorities(
  member: Member,
  permission?: AccountingPermission,
): string[] {
  if (!member.active) return ["غیرفعال (بدون دسترسی)"];
  if (member.role === "viewer") return ["فقط مشاهده"];
  if (member.role === "finance_manager") {
    return [
      "تأیید گزارش مالی (نقش)",
      "ثبت سند (نقش)",
      "بازگشایی دوره (نقش)",
      "حقوق و دستمزد (نقش)",
    ];
  }
  const items: string[] = [];
  if (member.role === "owner") {
    items.push("مدیریت اعضا و مجوزها (نقش)");
  } else {
    items.push("تهیه پیش‌نویس و تطبیق (نقش)");
  }
  if (member.approve_financial_report) items.push("تأیید گزارش مالی");
  if (permission?.post_journal) items.push("ثبت سند");
  if (permission?.reopen_period) items.push("بازگشایی دوره");
  if (permission?.view_payroll) items.push("حقوق و دستمزد");
  return items;
}

export function MembersList({
  c,
}: {
  c: ReturnType<typeof useMemberManagement>;
}) {
  const permissionList = listItems(c.permissions?.data);

  return (
    <Panel>
      {c.members.loading ? (
        <LoadingState />
      ) : c.members.error ? (
        <ErrorState
          message={c.members.error.message}
          onRetry={c.members.refresh}
        />
      ) : !c.totalMembers ? (
        <EmptyState title="هنوز عضوی در این شرکت ثبت نشده است" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <SearchInput
                value={c.query}
                onChange={(e) => c.setQuery(e.target.value)}
                label="جستجوی نام یا ایمیل عضو..."
                className="max-w-xs"
              />
              <div className="w-44">
                <Select
                  id="filter-role"
                  label="فیلتر نقش"
                  value={c.roleFilter}
                  onValueChange={c.setRoleFilter}
                  options={memberRoleFilterOptions}
                />
              </div>
              <div className="w-40">
                <Select
                  id="filter-status"
                  label="فیلتر وضعیت"
                  value={c.statusFilter}
                  onValueChange={c.setStatusFilter}
                  options={memberStatusFilterOptions}
                />
              </div>
              {c.hasActiveFilters && (
                <Button
                  variant="ghost"
                  onClick={c.resetFilters}
                  className="text-xs"
                >
                  <ArrowClockwiseIcon size={16} aria-hidden />
                  پاک‌کردن فیلترها
                </Button>
              )}
            </div>
            <span className="text-xs text-muted">
              {c.hasActiveFilters
                ? `${persian(c.rows.length)} از ${persian(c.totalMembers)} عضو`
                : `${persian(c.totalMembers)} عضو`}
            </span>
          </div>

          <Table showSearch={false}>
            <TableHeader>
              <TableRow>
                <TableHead>عضو</TableHead>
                <TableHead>نقش</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>دسترسی‌های حساس مؤثر</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.rows.length ? (
                c.rows.map((member) => {
                  const perm = permissionList.find((p) => p.membership_id === member.id);
                  const authorities = summarizeEffectiveAuthorities(member, perm);
                  return (
                    <TableRow key={member.id}>
                      <TableRowHeader>
                        {member.name || member.email || member.user_id}
                        {member.email && (
                          <span dir="ltr" className="block text-xs text-muted">
                            {member.email}
                          </span>
                        )}
                      </TableRowHeader>
                      <TableCell>{member.roleLabel}</TableCell>
                      <TableCell>
                        <Badge tone={member.active ? "success" : "neutral"}>
                          {member.active ? "فعال" : "غیرفعال"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {authorities.map((authLabel) => (
                            <Badge
                              key={authLabel}
                              tone={
                                !member.active
                                  ? "neutral"
                                  : authLabel.includes("(نقش)") || authLabel === "فقط مشاهده"
                                    ? "neutral"
                                    : "primary"
                              }
                            >
                              {authLabel}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="secondary"
                          disabled={c.permissions.loading}
                          onClick={() => c.openMember(member)}
                        >
                          مدیریت دسترسی
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableEmptyCell
                  colSpan={5}
                  title={
                    c.hasActiveFilters
                      ? "عضوی با این مشخصات پیدا نشد"
                      : "عضوی پیدا نشد"
                  }
                  action={
                    c.hasActiveFilters ? (
                      <Button variant="secondary" onClick={c.resetFilters}>
                        پاک‌کردن فیلترها
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
