"use client";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
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
import { Panel } from "./page-parts";
import {
  memberRoleFilterOptions,
  memberStatusFilterOptions,
  type useMemberManagement,
} from "@/hooks/use-member-management";
import { persian } from "@/lib/utils";

export function MembersList({
  c,
}: {
  c: ReturnType<typeof useMemberManagement>;
}) {
  return (
    <Panel>
      {c.members.loading ? (
        <LoadingState label="در حال دریافت اعضای شرکت..." />
      ) : c.members.error ? (
        <ErrorState
          message={c.members.error.message}
          onRetry={c.members.refresh}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <SearchInput
                label="جستجوی نام یا ایمیل عضو..."
                value={c.query}
                onChange={(event) => c.setQuery(event.target.value)}
                className="w-full sm:w-64"
              />
              <div className="w-full sm:w-40">
                <Select
                  id="filter-role"
                  label="فیلتر نقش"
                  value={c.roleFilter}
                  onValueChange={c.setRoleFilter}
                  options={memberRoleFilterOptions}
                />
              </div>
              <div className="w-full sm:w-36">
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

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>عضو</TableHead>
                <TableHead>نقش</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.rows.length ? (
                c.rows.map((member) => (
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
                      <Button
                        variant="secondary"
                        disabled={c.permissions.loading}
                        onClick={() => c.openMember(member)}
                      >
                        مدیریت دسترسی
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell
                  colSpan={4}
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
