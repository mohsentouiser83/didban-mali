"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
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
import type { useMemberManagement } from "@/hooks/use-member-management";
export function MembersList({
  c,
}: {
  c: ReturnType<typeof useMemberManagement>;
}) {
  return (
    <Panel>
      {c.members.loading ? (
        <LoadingState />
      ) : c.members.error ? (
        <ErrorState
          message={c.members.error.message}
          onRetry={c.members.refresh}
        />
      ) : (
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
              <TableEmptyCell colSpan={4} title="عضوی پیدا نشد" />
            )}
          </TableBody>
        </Table>
      )}
    </Panel>
  );
}
