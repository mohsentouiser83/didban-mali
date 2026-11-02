"use client";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { FormMessage } from "@/components/ui/field";
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
import { useAccountingPermissions } from "@/hooks/use-accounting";
import type { Member, ResourceList } from "@/lib/api";
import { Panel } from "./page-parts";

export function AccountingPermissionsPanel({
  members,
}: {
  members?: ResourceList<Member>;
}) {
  const view = useAccountingPermissions(members);
  if (!view.owner) return null;
  return (
    <Panel title="اختیارهای حسابداری" className="mt-5">
      {view.resource.loading ? (
        <LoadingState
          variant="message"
          label="در حال دریافت مجوزهای حسابداری"
        />
      ) : view.resource.error ? (
        <ErrorState
          message={view.resource.error.message}
          onRetry={view.resource.refresh}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>عضو</TableHead>
              <TableHead>ثبت سند</TableHead>
              <TableHead>بازگشایی دوره</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.rows.length ? (
              view.rows.map((permission) => (
                <TableRow key={permission.membership_id}>
                  <TableRowHeader>{permission.name}</TableRowHeader>
                  <TableCell>
                    {permission.implicit_authority ? (
                      <Badge tone="success">اختیار مدیر مالی</Badge>
                    ) : (
                      <Checkbox
                        id={`post-${permission.membership_id}`}
                        label={`مجوز ثبت سند برای ${permission.name}`}
                        checked={permission.post_journal}
                        disabled={
                          view.command.busy || permission.role === "viewer"
                        }
                        onCheckedChange={(post_journal) =>
                          view.change(permission, { post_journal })
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {permission.implicit_authority ? (
                      <Badge tone="success">اختیار مدیر مالی</Badge>
                    ) : (
                      <Checkbox
                        id={`reopen-${permission.membership_id}`}
                        label={`مجوز بازگشایی دوره برای ${permission.name}`}
                        checked={permission.reopen_period}
                        disabled={
                          view.command.busy || permission.role === "viewer"
                        }
                        onCheckedChange={(reopen_period) =>
                          view.change(permission, { reopen_period })
                        }
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableEmptyCell colSpan={3} title="عضوی پیدا نشد" />
            )}
          </TableBody>
        </Table>
      )}
      <FormMessage error>{view.command.error?.message}</FormMessage>
    </Panel>
  );
}
