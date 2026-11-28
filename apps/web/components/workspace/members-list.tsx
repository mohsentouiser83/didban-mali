"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { Badge } from "@/components/ui/badge";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui/content-states";
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
import type { AccountingPermission } from "@/lib/accounting";
import { Panel } from "./page-parts";

function summarizeEffectiveAuthorities(
  member: Member,
  permission?: AccountingPermission,
): string[] {
  if (!member.active) return ["غیرفعال (بدون دسترسی)"];
  if (member.role === "viewer") return ["—"];
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
  }
  if (member.approve_financial_report) items.push("تأیید گزارش مالی");
  if (permission?.post_journal) items.push("ثبت سند");
  if (permission?.reopen_period) items.push("بازگشایی دوره");
  if (permission?.view_payroll) items.push("حقوق و دستمزد");
  return items.length ? items : ["—"];
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>عضو</TableHead>
                <TableHead>نقش</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>مجوزهای مستقل</TableHead>
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
                                  : authLabel.includes("(نقش)") || authLabel === "—"
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
                        <TableRowActions label={`عملیات ${member.name}`}>
                          <TableRowAction
                            disabled={c.permissions.loading}
                            onClick={() => c.openMember(member)}
                          >
                            مدیریت دسترسی
                          </TableRowAction>
                        </TableRowActions>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableEmptyCell
                  colSpan={5}
                  title="عضوی پیدا نشد"
                />
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
