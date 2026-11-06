"use client";
import { BuildingsIcon as HeaderIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useCommand } from "@/hooks/use-command";
import { useWorkspace } from "@/hooks/workspace";
import { BuildingsIcon, PlusIcon, UserIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { PageHeader, Panel } from "./page-parts";
import { CompanyAccountingSetup } from "./company-accounting-setup";
import { CompanyList } from "./company-list";

const roles = [
  { value: "owner", label: "مالک" },
  { value: "finance_manager", label: "مدیر مالی" },
  { value: "advisor", label: "مشاور / حسابدار" },
  { value: "viewer", label: "مشاهده‌گر" },
];
export function CompanyView() {
  const workspace = useWorkspace();
  const command = useCommand();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const canCreate = workspace.user?.installation_admin;
  return (
    <>
      <PageHeader icon={HeaderIcon}
        title="شرکت‌های من"
        action={
          canCreate && (
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(true);
                setName("");
                command.clearError();
              }}
            >
              <PlusIcon size={18} />
              شرکت جدید
            </Button>
          )
        }
      />
      <div className="space-y-5">
      <CompanyList companies={workspace.companies} activeId={workspace.company?.id} onSelect={workspace.setCompany} />
      {workspace.company ? (
        <Panel title="اطلاعات شرکت">
          <dl className="mb-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-control bg-canvas p-4">
              <dt className="flex items-center gap-2 text-xs text-muted">
                <BuildingsIcon size={16} className="text-primary" />
                نام شرکت
              </dt>
              <dd className="mt-2">{workspace.company.name}</dd>
            </div>
            <div className="rounded-control bg-canvas p-4">
              <dt className="flex items-center gap-2 text-xs text-muted">
                <UserIcon size={16} className="text-primary" />
                نقش شما
              </dt>
              <dd className="mt-2">
                {roles.find((role) => role.value === workspace.company?.role)
                  ?.label || "نامشخص"}
              </dd>
            </div>
          </dl>
          {workspace.company.role === "owner" && (
            <Form
              fieldErrors={command.error?.fields}
              onSubmit={(event) => {
                event.preventDefault();
                void command.run(
                  `/companies/${workspace.company!.id}`,
                  {
                    method: "PATCH",
                    body: { name: name.trim() },
                    version: workspace.company!.version,
                  },
                  () => {
                    void workspace.refreshCompanies();
                    setName("");
                  },
                  "نام شرکت ذخیره شد.",
                );
              }}
            >
              <div className="max-w-lg">
                <Field
                  id="company-name"
                  label="نام جدید شرکت"
                  icon={BuildingsIcon}
                >
                  <Input
                    id="company-name"
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
              </div>
              <FormMessage error>{command.error?.message}</FormMessage>
              <Button type="submit" busy={command.busy}>
                ذخیره تغییرات
              </Button>
            </Form>
          )}
        </Panel>
      ) : (
        <Panel>
          <EmptyState
            title="هنوز شرکتی ندارید"
            action={
              canCreate ? (
                <Button onClick={() => setCreating(true)}>ایجاد شرکت</Button>
              ) : undefined
            }
          />
        </Panel>
      )}
      </div>
      {workspace.company && <CompanyAccountingSetup key={workspace.company.id}/>}
      <Drawer title="ایجاد شرکت" open={creating} onOpenChange={setCreating}>
        <Form
          fieldErrors={command.error?.fields}
          onSubmit={(event) => {
            event.preventDefault();
            void command.run(
              "/companies",
              { body: { name: name.trim() } },
              () => {
                setCreating(false);
                setName("");
                void workspace.refreshCompanies();
              },
              "شرکت ایجاد شد.",
            );
          }}
        >
          <Field id="new-company-name" label="نام شرکت" icon={BuildingsIcon}>
            <Input
              id="new-company-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <FormMessage error>{command.error?.message}</FormMessage>
          <Button type="submit" busy={command.busy}>
            ایجاد شرکت
          </Button>
        </Form>
      </Drawer>
    </>
  );
}
