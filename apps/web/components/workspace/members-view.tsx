"use client";
import { UsersThreeIcon as HeaderIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
import { useCommand } from "@/hooks/use-command";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import {
  listItems,
  type Member,
  type ResourceList,
  type User,
} from "@/lib/api";
import {
  EnvelopeSimpleIcon,
  LockKeyIcon,
  PlusIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { AccountingPermissionsPanel } from "./accounting-permissions-panel";

const roles = [
  { value: "owner", label: "مالک" },
  { value: "finance_manager", label: "مدیر مالی" },
  { value: "advisor", label: "مشاور / حسابدار" },
  { value: "viewer", label: "مشاهده‌گر" },
];
export function MembersView() {
  const workspace = useWorkspace();
  const resource = useResource<ResourceList<Member>>(
    workspace.companyPath("members"),
  );
  const users = useResource<ResourceList<User>>(
    workspace.user?.installation_admin ? "/admin/users" : null,
  );
  const command = useCommand();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("viewer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const owner = workspace.company?.role === "owner";
  if (!workspace.company) return <NoCompany />;
  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="اعضا و دسترسی"
        action={
          <div className="flex gap-2">
            {workspace.user?.installation_admin && (
              <Button
                variant="secondary"
                onClick={() => {
                  setAccountOpen(true);
                  command.clearError();
                }}
              >
                ایجاد حساب
              </Button>
            )}
            {owner && (
              <Button
                onClick={() => {
                  setOpen(true);
                  command.clearError();
                }}
              >
                <PlusIcon size={18} />
                افزودن عضو
              </Button>
            )}
          </div>
        }
      />
      <Panel>
        {resource.loading ? (
          <LoadingState />
        ) : resource.error ? (
          <ErrorState
            message={resource.error.message}
            onRetry={resource.refresh}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>عضو</TableHead>
                <TableHead>نقش</TableHead>
                <TableHead>تأیید گزارش</TableHead>
                <TableHead>وضعیت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listItems(resource.data).length ? (
                listItems(resource.data).map((member) => (
                  <TableRow key={member.id}>
                    <TableRowHeader>
                      <span className="block">
                        {member.name || member.email || member.user_id}
                      </span>
                      {member.email && (
                        <span dir="ltr" className="block text-xs text-muted">
                          {member.email}
                        </span>
                      )}
                    </TableRowHeader>
                    <TableCell>
                      {owner ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) =>
                            void command.run(
                              workspace.companyPath(`members/${member.id}`),
                              {
                                method: "PATCH",
                                version: member.version,
                                body: { role },
                              },
                              resource.refresh,
                              "نقش ذخیره شد.",
                            )
                          }
                          options={roles}
                          disabled={command.busy}
                          label="نقش عضو"
                          className="min-w-40"
                        />
                      ) : (
                        roles.find((role) => role.value === member.role)
                          ?.label || "نامشخص"
                      )}
                    </TableCell>
                    <TableCell>
                      {member.role === "finance_manager" ? (
                        <Badge tone="success">اختیار مدیر مالی</Badge>
                      ) : ["owner", "advisor"].includes(member.role) ? (
                        <Checkbox
                          checked={member.approve_financial_report}
                          disabled={!owner || command.busy}
                          onCheckedChange={(approved) =>
                            void command.run(
                              workspace.companyPath(`members/${member.id}`),
                              {
                                method: "PATCH",
                                version: member.version,
                                body: { approve_financial_report: approved },
                              },
                              resource.refresh,
                              "مجوز تأیید گزارش ذخیره شد.",
                            )
                          }
                          label="مجوز صریح"
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {owner ? (
                        <Button
                          variant="ghost"
                          disabled={command.busy}
                          onClick={() =>
                            void command.run(
                              workspace.companyPath(`members/${member.id}`),
                              {
                                method: "PATCH",
                                version: member.version,
                                body: { active: !member.active },
                              },
                              resource.refresh,
                              "دسترسی عضو ذخیره شد.",
                            )
                          }
                        >
                          {member.active
                            ? "فعال؛ لغو دسترسی"
                            : "غیرفعال؛ فعال‌سازی"}
                        </Button>
                      ) : member.active ? (
                        "فعال"
                      ) : (
                        "غیرفعال"
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell colSpan={4} title="عضوی پیدا نشد" />
              )}
            </TableBody>
          </Table>
        )}
        <FormMessage error>
          {!open && !accountOpen ? command.error?.message : undefined}
        </FormMessage>
      </Panel>
      <AccountingPermissionsPanel
        key={workspace.company.id}
        members={resource.data}
      />
      <Drawer title="افزودن عضو شرکت" open={open} onOpenChange={setOpen}>
        <Form
          fieldErrors={command.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            void command.run(
              workspace.companyPath("members"),
              { body: { user_id: userId, role } },
              () => {
                setOpen(false);
                resource.refresh();
              },
              "عضو اضافه شد.",
            );
          }}
        >
          <Field
            name="user_id"
            id="member-user"
            label="حساب کاربر"
            icon={UserIcon}
          >
            {workspace.user?.installation_admin ? (
              <Select
                id="member-user"
                value={userId}
                onValueChange={setUserId}
                options={listItems(users.data).map((user) => ({
                  value: user.id,
                  label: `${user.name} (${user.email})`,
                }))}
              />
            ) : (
              <Input
                id="member-user"
                dir="ltr"
                required
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="شناسه حساب"
              />
            )}
          </Field>
          <Field id="member-role" label="نقش" icon={UserIcon}>
            <Select
              id="member-role"
              value={role}
              onValueChange={setRole}
              options={roles}
            />
          </Field>
          <FormMessage error>{command.error?.message}</FormMessage>
          <Button type="submit" busy={command.busy} disabled={!userId}>
            افزودن عضو
          </Button>
        </Form>
      </Drawer>
      <Drawer
        title="ایجاد حساب سازمانی"
        open={accountOpen}
        onOpenChange={setAccountOpen}
      >
        <Form
          fieldErrors={command.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            void command.run(
              "/admin/users",
              { body: { name: name.trim(), email: email.trim(), password } },
              () => {
                setAccountOpen(false);
                setName("");
                setEmail("");
                setPassword("");
                users.refresh();
              },
              "حساب ایجاد شد.",
            );
          }}
        >
          <Field id="account-name" label="نام" icon={UserIcon}>
            <Input
              id="account-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field id="account-email" label="ایمیل" icon={EnvelopeSimpleIcon}>
            <Input
              id="account-email"
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field id="account-password" label="رمز اولیه" icon={LockKeyIcon}>
            <Input
              id="account-password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <FormMessage error>{command.error?.message}</FormMessage>
          <Button type="submit" busy={command.busy}>
            ایجاد حساب
          </Button>
        </Form>
      </Drawer>
    </>
  );
}
