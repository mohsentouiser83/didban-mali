"use client";
import { BuildingsIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { DetailField, DetailGroup } from "@/components/ui/field-layout";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCompanyAccountingSetup } from "@/hooks/use-accounting-setup";
import { useCompanyManagement } from "@/hooks/use-company-management";
import { memberRoles } from "@/lib/members";
import { PageHeader, Panel } from "./page-parts";
import { CompanyList } from "./company-list";

function ActiveCompanyAccountingMode() {
  const setup = useCompanyAccountingSetup();
  if (setup.resource.loading) return <LoadingState label="در حال دریافت کاربرد حسابداری شرکت" />;
  if (setup.resource.error) {
    return <ErrorState message={setup.resource.error.message} onRetry={setup.resource.refresh} />;
  }
  const canManage = setup.resource.data?.can_manage === true;
  const dirty = Boolean(setup.resource.data && setup.mode !== setup.resource.data.mode);

  return (
    <div className="space-y-4 rounded-control border border-border/70 bg-canvas/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">کاربرد حسابداری شرکت فعال</h3>
        <Badge tone={setup.resource.data?.posting_available ? "success" : "neutral"}>
          {setup.mode === "primary" ? "حسابداری اصلی" : "تحلیل داده‌های بیرونی"}
        </Badge>
      </div>
      <StatusMessage tone="primary">
        {setup.postingStatus}
      </StatusMessage>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void setup.save();
        }}
        fieldErrors={setup.command.error?.fields}
      >
        <Field id="company-accounting-mode" label="حالت کاری حسابداری">
          <Select
            id="company-accounting-mode"
            value={setup.mode}
            onValueChange={(value) => setup.setMode(value as "analysis" | "primary")}
            disabled={!canManage || setup.command.busy}
            options={[
              { value: "analysis", label: "تحلیل داده‌های بیرونی (فایل‌های اکسل/CSV)" },
              { value: "primary", label: "حسابداری اصلی و ثبت پیش‌نویس/سند بومی" },
            ]}
          />
        </Field>
        <FormMessage error>{setup.command.error?.message}</FormMessage>
        {canManage && (
          <Button type="submit" variant="secondary" busy={setup.command.busy} disabled={!dirty}>
            ذخیره کاربرد حسابداری
          </Button>
        )}
      </Form>
    </div>
  );
}

export function CompanyView() {
  const c = useCompanyManagement();
  const isOwner = c.selected?.role === "owner";
  const isSelectedActive = Boolean(c.selected && c.selected.id === c.workspace.company?.id);

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
        title={c.creating ? "شرکت جدید" : "مشخصات و مدیریت شرکت"}
        open={c.creating || !!c.selectedId}
        onOpenChange={(open) => {
          if (!open) {
            c.closeCreate();
            c.closeCompany();
          }
        }}
      >
        {!c.creating && !c.selected ? (
          <LoadingState label="در حال بارگذاری مشخصات شرکت" />
        ) : (
          <div className="space-y-6">
            {!c.creating && c.selected && (
              <DetailGroup>
                <DetailField
                  label="وضعیت انتخاب در نشست"
                  value={isSelectedActive ? "شرکت فعال جاری" : "شرکت غیرفعال در نشست فعلی"}
                />
                <DetailField
                  label="نقش شما در این شرکت"
                  value={memberRoles.find((r) => r.value === c.selected?.role)?.label ?? c.selected.role}
                />
              </DetailGroup>
            )}

            <Form
              onSubmit={(event) => {
                event.preventDefault();
                c.save();
              }}
              fieldErrors={c.command.error?.fields}
            >
              <Field id="company-name" label="نام شرکت" required>
                <Input
                  id="company-name"
                  required
                  maxLength={120}
                  value={c.name}
                  onChange={(event) => c.setName(event.target.value)}
                  disabled={c.command.busy || (!c.creating && !isOwner)}
                />
              </Field>
              <FormMessage error>{c.command.error?.message}</FormMessage>
              {(c.creating || isOwner) && (
                <Button
                  type="submit"
                  busy={c.command.busy}
                  disabled={!c.name.trim() || (!c.creating && c.name.trim() === c.selected?.name)}
                >
                  {c.creating ? "ایجاد شرکت" : "ذخیره نام شرکت"}
                </Button>
              )}
            </Form>

            {!c.creating && c.selected && (
              isSelectedActive ? (
                <ActiveCompanyAccountingMode key={c.selected.id} />
              ) : (
                <div className="space-y-3 rounded-control border border-border/70 bg-canvas/40 p-3.5">
                  <Button
                    variant="secondary"
                    onClick={() => c.workspace.setCompany(c.selected!.id)}
                  >
                    انتخاب به‌عنوان شرکت فعال
                  </Button>
                </div>
              )
            )}

          </div>
        )}
      </Drawer>
    </>
  );
}
