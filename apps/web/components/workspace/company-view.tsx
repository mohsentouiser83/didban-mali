"use client";
import { BuildingsIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useCompanyManagement } from "@/hooks/use-company-management";
import { PageHeader, Panel } from "./page-parts";
import { CompanyAccountingSetup } from "./company-accounting-setup";
import { CompanyList } from "./company-list";
export function CompanyView() {
  const c = useCompanyManagement();
  return (
    <>
      <PageHeader
        title="شرکت‌ها"
        icon={BuildingsIcon}
        action={
          c.workspace.user?.installation_admin && (
            <Button onClick={c.openCreate}>شرکت جدید</Button>
          )
        }
      />
      {c.workspace.companies.length ? (
        <CompanyList
          companies={c.workspace.companies}
          activeId={c.workspace.company?.id}
          onSelect={c.workspace.setCompany}
          onManage={c.openCompany}
        />
      ) : (
        <Panel>
          <EmptyState title="هنوز شرکتی ندارید" />
        </Panel>
      )}
      <Drawer
        title={c.creating ? "شرکت جدید" : "جزئیات شرکت"}
        open={c.creating || !!c.selectedId}
        onOpenChange={(open) => {
          if (!open) {
            c.closeCreate();
            c.closeCompany();
          }
        }}
      >
        {!c.creating && !c.selected ? (
          <LoadingState label="در حال انتخاب شرکت" />
        ) : (
          <div className="space-y-6">
            <Form
              onSubmit={(event) => {
                event.preventDefault();
                c.save();
              }}
              fieldErrors={c.command.error?.fields}
            >
              <Field id="company-name" label="نام شرکت">
                <Input
                  id="company-name"
                  required
                  maxLength={150}
                  value={c.name}
                  onChange={(event) => c.setName(event.target.value)}
                  disabled={
                    c.command.busy ||
                    (!c.creating && c.selected?.role !== "owner")
                  }
                />
              </Field>
              <FormMessage error>{c.command.error?.message}</FormMessage>
              {(c.creating || c.selected?.role === "owner") && (
                <Button
                  type="submit"
                  busy={c.command.busy}
                  disabled={!c.name.trim()}
                >
                  ذخیره شرکت
                </Button>
              )}
            </Form>
            {!c.creating && c.selected && (
              <CompanyAccountingSetup
                key={`${c.workspace.user?.id}:${c.selected.id}`}
              />
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}
