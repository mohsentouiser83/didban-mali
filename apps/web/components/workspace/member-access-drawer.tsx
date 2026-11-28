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
import { MemberModuleFields } from "./member-module-fields";
import { memberRoles } from "@/lib/members";
import { useWorkspace } from "@/hooks/workspace";
import type { useMemberManagement } from "@/hooks/use-member-management";
export function MemberAccessDrawer({
  c,
}: {
  c: ReturnType<typeof useMemberManagement>;
}) {
  const { company } = useWorkspace();
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
          className="space-y-4 rounded-control border border-border/70 bg-canvas/40 p-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            c.saveMember();
          }}
        >
          <div>
            <h3 className="text-sm font-medium">عضویت و دسترسی ماژول‌ها</h3>
          </div>
          <Field id="edit-member-role" label="نقش" required>
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
            <Badge>تأیید گزارش مالی با اختیار ذاتی نقش مدیر مالی</Badge>
          ) : (
            ["owner", "advisor"].includes(c.value.role) && (
              <Checkbox
                label="اجازه صریح تأیید گزارش مالی (مستقل از نقش مالک)"
                checked={c.value.approve_financial_report}
                onCheckedChange={(approve_financial_report) =>
                  c.change({ approve_financial_report })
                }
                disabled={c.command.busy || c.accessCommand.busy}
              />
            )
          )}
          {c.selected && c.lastActiveOwnerId === c.selected.id && (c.value.role !== "owner" || !c.value.active) && (
            <StatusMessage tone="warning">
              این کاربر تنها مالک فعال شرکت است و تغییر نقش یا غیرفعال‌سازی آن مجاز نیست.
            </StatusMessage>
          )}
          <MemberModuleFields
            value={c.moduleAccess}
            disabled={c.command.busy || c.accessCommand.busy}
            businessMode={company?.business_mode}
            onChange={c.changeModuleAccess}
          />
          <FormMessage error>{c.command.error?.message}</FormMessage>
          <Button
            type="submit"
            busy={c.command.busy}
            disabled={
              !c.membershipDirty ||
              c.accessCommand.busy ||
              Boolean(
                c.selected &&
                  c.lastActiveOwnerId === c.selected.id &&
                  (c.value.role !== "owner" || !c.value.active),
              )
            }
          >
            ذخیره عضویت و دسترسی
          </Button>
        </Form>
        {c.permissions.loading ? (
          <LoadingState />
        ) : c.permissions.error ? (
          <ErrorState
            message={c.permissions.error.message}
          />
        ) : (
          c.permission && (
            <Form
              className="space-y-4 rounded-control border border-border/70 bg-canvas/40 p-3.5"
              onSubmit={(event) => {
                event.preventDefault();
                c.saveAccess();
              }}
            >
              <div>
                <h3 className="text-sm font-medium">مجوزهای مستقل حسابداری</h3>
              </div>
              {c.permission.implicit_authority ? (
                <Badge>دسترسی خودکار مدیر مالی</Badge>
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
                  <Checkbox
                    label="دسترسی حقوق و دستمزد"
                    checked={c.accessValue.view_payroll}
                    onCheckedChange={(view_payroll) =>
                      c.setAccessValue({ ...c.accessValue, view_payroll })
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
                    ذخیره دسترسی‌های حسابداری
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
