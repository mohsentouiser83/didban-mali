"use client";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import {
  ErrorState,
  LoadingState,
  StatusMessage,
} from "@/components/ui/content-states";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { memberRoles } from "@/hooks/use-member-management";
import type { useMemberManagement } from "@/hooks/use-member-management";
export function MemberAddDrawer({
  c,
}: {
  c: ReturnType<typeof useMemberManagement>;
}) {
  return (
    <Drawer
      title="افزودن عضو"
      open={c.adding}
      onOpenChange={(open) => {
        if (!open) c.closeAdd();
      }}
    >
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void c.add();
        }}
        fieldErrors={c.command.error?.fields}
      >
        {c.canCreateAccount && !c.userId && (
          <Select
            label="روش افزودن"
            value={c.method}
            onValueChange={c.setMethod}
            disabled={c.command.busy}
            options={[
              { value: "existing", label: "انتخاب حساب موجود" },
              { value: "new", label: "ایجاد حساب جدید" },
            ]}
          />
        )}
        {c.method === "new" && !c.userId ? (
          <>
            <Field id="member-name" label="نام">
              <Input
                id="member-name"
                required
                disabled={c.command.busy}
                value={c.account.name}
                onChange={(event) =>
                  c.setAccount({ ...c.account, name: event.target.value })
                }
              />
            </Field>
            <Field id="member-email" label="ایمیل">
              <Input
                id="member-email"
                type="email"
                dir="ltr"
                required
                disabled={c.command.busy}
                value={c.account.email}
                onChange={(event) =>
                  c.setAccount({ ...c.account, email: event.target.value })
                }
              />
            </Field>
            <Field id="member-password" label="رمز اولیه">
              <Input
                id="member-password"
                type="password"
                dir="ltr"
                minLength={12}
                autoComplete="new-password"
                required
                disabled={c.command.busy}
                value={c.account.password}
                onChange={(event) =>
                  c.setAccount({ ...c.account, password: event.target.value })
                }
              />
            </Field>
          </>
        ) : c.method === "new" && c.userId ? (
          <StatusMessage>
            حساب ایجاد شده؛ افزودن به شرکت هنوز کامل نشده است.
          </StatusMessage>
        ) : (
          <Field id="member-user" label="حساب کاربر">
            {c.canCreateAccount ? (
              c.users.loading ? (
                <LoadingState />
              ) : c.users.error ? (
                <ErrorState
                  message={c.users.error.message}
                  onRetry={c.users.refresh}
                />
              ) : (
                <Select
                  id="member-user"
                  value={c.userId}
                  onValueChange={c.setUserId}
                  options={c.userOptions}
                  disabled={c.command.busy}
                />
              )
            ) : (
              <Input
                id="member-user"
                dir="ltr"
                required
                value={c.userId}
                onChange={(event) => c.setUserId(event.target.value)}
              />
            )}
          </Field>
        )}
        <Field id="new-member-role" label="نقش">
          <Select
            id="new-member-role"
            value={c.newRole}
            onValueChange={c.setNewRole}
            options={memberRoles}
            disabled={c.command.busy}
          />
        </Field>
        <FormMessage error>
          {c.command.error?.message || c.validation}
        </FormMessage>
        <Button type="submit" busy={c.command.busy}>
          افزودن عضو به شرکت
        </Button>
      </Form>
    </Drawer>
  );
}
