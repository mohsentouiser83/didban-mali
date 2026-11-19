"use client";

import {
  HashIcon,
  InfoIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
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
import { useNumberingSystem } from "@/hooks/use-numbering-system";
import { useWorkspace } from "@/hooks/workspace";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function NumberingSystemView() {
  const workspace = useWorkspace();
  return workspace.company ? (
    <WorkspaceView key={workspace.company.id} />
  ) : (
    <NoCompany />
  );
}

function WorkspaceView() {
  const view = useNumberingSystem();

  return (
    <>
      <PageHeader
        title="سیستم شماره‌گذاری"
        icon={HashIcon}
      />

      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-panel border border-primary/20 bg-primary-soft/40 p-4 text-sm text-foreground">
          <InfoIcon size={20} aria-hidden className="mt-0.5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              سیستم شماره‌گذاری و کدگذاری موجودیت‌های مالی
            </p>
            <p className="text-muted leading-relaxed">
              تمام موجودیت‌ها و اسناد مالی به‌صورت پیش‌فرض از <strong>۰۰۱</strong> شروع می‌شوند.
              شما می‌توانید پیشوند، شماره شروع، شماره جاری، تعداد ارقام (Padding) و پسوند هر موجودیت را ویرایش کنید.
              برای حفظ یکپارچگی دفاتر و اسناد، حذف قواعد پایه شماره‌گذاری امکان‌پذیر نیست.
            </p>
          </div>
        </div>

        <Panel
          title="قواعد شماره‌گذاری نهادها"
          action={
            <div className="flex w-full items-center gap-3 sm:w-auto">
              <SearchInput
                label="جستجوی موجودیت..."
                value={view.search}
                onChange={(e) => view.setSearch(e.target.value)}
                className="w-full sm:w-64"
              />
            </div>
          }
        >
          {view.resource.loading ? (
            <LoadingState label="در حال دریافت قواعد شماره‌گذاری..." />
          ) : view.resource.error ? (
            <ErrorState
              message={view.resource.error.message}
              onRetry={view.resource.refresh}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام موجودیت</TableHead>
                  <TableHead>پیشوند</TableHead>
                  <TableHead>شماره جاری</TableHead>
                  <TableHead>تعداد ارقام</TableHead>
                  <TableHead>پسوند</TableHead>
                  <TableHead>پیش‌نمایش شماره</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rules.length ? (
                  view.rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableRowHeader>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground">
                            {rule.entity_title}
                          </span>
                          <span className="font-mono text-xs text-muted">
                            {rule.entity_type}
                          </span>
                        </div>
                      </TableRowHeader>
                      <TableCell>
                        {rule.prefix ? (
                          <span className="font-mono font-medium text-primary">
                            {rule.prefix}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-foreground">
                          {rule.current_number}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted">{rule.padding} رقم</span>
                      </TableCell>
                      <TableCell>
                        {rule.suffix ? (
                          <span className="font-mono font-medium text-primary">
                            {rule.suffix}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge tone="primary" className="font-mono text-xs tracking-wider">
                          {rule.sample}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge tone={rule.active ? "success" : "neutral"}>
                          {rule.active ? "فعال" : "غیرفعال"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="secondary"
                          onClick={() => view.open(rule)}
                          className="gap-1.5"
                        >
                          <PencilSimpleIcon size={16} aria-hidden />
                          {view.workspace.canWrite ? "ویرایش" : "مشاهده"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell
                    colSpan={8}
                    title="موردی در سیستم شماره‌گذاری یافت نشد"
                  />
                )}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>

      <Drawer
        title={
          view.editing
            ? `ویرایش شماره‌گذاری: ${view.editing.entity_title}`
            : "قاعده شماره‌گذاری"
        }
        open={view.editing !== undefined}
        onOpenChange={(open) => {
          if (!open) view.close();
        }}
      >
        {view.editing && (
          <Form
            fieldErrors={view.command.error?.fields}
            onSubmit={(event) => {
              event.preventDefault();
              view.save();
            }}
          >
            <fieldset
              className="space-y-4"
              disabled={!view.workspace.canWrite || view.command.busy}
            >
              <div className="rounded-control border border-border bg-canvas/60 p-4">
                <p className="text-xs font-medium text-muted mb-1.5">
                  پیش‌نمایش شماره ایجادشده بعدی:
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xl font-bold tracking-wider text-primary">
                    {view.livePreview}
                  </span>
                  <Badge tone="primary" className="font-mono text-xs">
                    نمونه خروجی
                  </Badge>
                </div>
              </div>

              <Field id="rule-prefix" label="پیشوند (اختیاری)">
                <Input
                  id="rule-prefix"
                  maxLength={30}
                  placeholder="مثال: FAC- یا ACC-"
                  value={view.value.prefix}
                  onChange={(e) => view.change({ prefix: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field id="rule-current" label="شماره جاری">
                  <Input
                    id="rule-current"
                    type="number"
                    min={1}
                    required
                    value={view.value.current_number}
                    onChange={(e) =>
                      view.change({ current_number: Math.max(1, parseInt(e.target.value, 10) || 1) })
                    }
                  />
                </Field>

                <Field id="rule-start" label="شماره شروع">
                  <Input
                    id="rule-start"
                    type="number"
                    min={1}
                    required
                    value={view.value.start_number}
                    onChange={(e) =>
                      view.change({ start_number: Math.max(1, parseInt(e.target.value, 10) || 1) })
                    }
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field id="rule-padding" label="تعداد ارقام (تعداد صفرها)">
                  <Input
                    id="rule-padding"
                    type="number"
                    min={1}
                    max={10}
                    required
                    value={view.value.padding}
                    onChange={(e) =>
                      view.change({
                        padding: Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)),
                      })
                    }
                  />
                </Field>

                <Field id="rule-suffix" label="پسوند (اختیاری)">
                  <Input
                    id="rule-suffix"
                    maxLength={30}
                    placeholder="مثال: /1403"
                    value={view.value.suffix}
                    onChange={(e) => view.change({ suffix: e.target.value })}
                  />
                </Field>
              </div>

              <Field id="rule-description" label="توضیحات">
                <Input
                  id="rule-description"
                  maxLength={255}
                  value={view.value.description}
                  onChange={(e) => view.change({ description: e.target.value })}
                />
              </Field>

              <Checkbox
                id="rule-active"
                label="قاعده فعال است"
                checked={view.value.active}
                onCheckedChange={(active) => view.change({ active })}
              />

              <div className="rounded-control bg-warning-soft/30 border border-warning/20 p-3 text-xs text-warning leading-relaxed">
                توجه: سیستم شماره‌گذاری پیش‌فرض برای این موجودیت غیرقابل حذف است و تنها امکان ویرایش مقادیر آن وجود دارد.
              </div>
            </fieldset>

            <FormMessage error>{view.command.error?.message}</FormMessage>

            <div className="mt-5 flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button variant="secondary" onClick={view.close} type="button">
                انصراف
              </Button>
              {view.workspace.canWrite && (
                <Button type="submit" busy={view.command.busy}>
                  ذخیره تغییرات
                </Button>
              )}
            </div>
          </Form>
        )}
      </Drawer>
    </>
  );
}
