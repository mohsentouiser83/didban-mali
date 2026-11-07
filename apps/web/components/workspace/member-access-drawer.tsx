"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer } from "@/components/ui/drawer";
import {
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { memberRoles } from "@/hooks/use-member-management";
import type { useMemberManagement } from "@/hooks/use-member-management";
export function MemberAccessDrawer({
  c,
}: {
  c: ReturnType<typeof useMemberManagement>;
}) {
  return (
    <Drawer
      title={c.selected?.name || "دسترسی عضو"}
      open={!!c.selected}
      onOpenChange={(open) => {
        if (!open) c.closeMember();
      }}
    >
      <div className="space-y-6">
        <Form
          onSubmit={(event) => {
            event.preventDefault();
            c.saveMember();
          }}
        >
          <Field id="edit-member-role" label="نقش">
            <Select
              id="edit-member-role"
              value={c.value.role}
              onValueChange={c.setRole}
              options={memberRoles}
              disabled={c.command.busy || c.accessCommand.busy}
            />
          </Field>
          <Checkbox
            label="عضویت فعال"
            checked={c.value.active}
            onCheckedChange={(active) => c.change({ active })}
            disabled={c.command.busy || c.accessCommand.busy}
          />
          {c.value.role === "finance_manager" ? (
            <Badge>تأیید گزارش با اختیار مدیر مالی</Badge>
          ) : (
            ["owner", "advisor"].includes(c.value.role) && (
              <Checkbox
                label="اجازه تأیید گزارش"
                checked={c.value.approve_financial_report}
                onCheckedChange={(approve_financial_report) =>
                  c.change({ approve_financial_report })
                }
                disabled={c.command.busy || c.accessCommand.busy}
              />
            )
          )}
          <FormMessage error>{c.command.error?.message}</FormMessage>
          <Button
            type="submit"
            busy={c.command.busy}
            disabled={!c.membershipDirty || c.accessCommand.busy}
          >
            ذخیره عضویت و نقش
          </Button>
        </Form>
        {c.permissions.loading ? (
          <LoadingState />
        ) : c.permissions.error ? (
          <ErrorState
            message={c.permissions.error.message}
            onRetry={c.permissions.refresh}
          />
        ) : (
          c.permission && (
            <Form
              className="space-y-4 border-t border-border pt-5"
              onSubmit={(event) => {
                event.preventDefault();
                c.saveAccess();
              }}
            >
              <h3 className="text-sm font-medium">اختیارهای حسابداری</h3>
              {c.permission.implicit_authority ? (
                <Badge>اختیار مدیر مالی</Badge>
              ) : (
                <>
                  <Checkbox
                    label="اجازه ثبت سند"
                    checked={c.accessValue.post_journal}
                    onCheckedChange={(post_journal) =>
                      c.setAccessValue({ ...c.accessValue, post_journal })
                    }
                    disabled={
                      c.membershipDirty ||
                      !c.selected?.active ||
                      c.selected?.role === "viewer" ||
                      c.accessCommand.busy ||
                      c.command.busy
                    }
                  />
                  <Checkbox
                    label="اجازه بازگشایی دوره"
                    checked={c.accessValue.reopen_period}
                    onCheckedChange={(reopen_period) =>
                      c.setAccessValue({ ...c.accessValue, reopen_period })
                    }
                    disabled={
                      c.membershipDirty ||
                      !c.selected?.active ||
                      c.selected?.role === "viewer" ||
                      c.accessCommand.busy ||
                      c.command.busy
                    }
                  />
                  {c.membershipDirty && (
                    <StatusMessage>
                      ابتدا تغییر عضویت و نقش را ذخیره کنید.
                    </StatusMessage>
                  )}
                  <FormMessage error>
                    {c.accessCommand.error?.message}
                  </FormMessage>
                  <Button
                    type="submit"
                    busy={c.accessCommand.busy}
                    disabled={
                      !c.accessDirty ||
                      c.membershipDirty ||
                      c.command.busy ||
                      !c.selected?.active ||
                      c.selected?.role === "viewer"
                    }
                  >
                    ذخیره اختیارهای حسابداری
                  </Button>
                </>
              )}
            </Form>
          )
        )}
      </div>
    </Drawer>
  );
}
