"use client";

import {
  HashIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
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
        action={
          view.workspace.canWrite && (
            <Button onClick={() => view.open(null)}>
              <PlusIcon size={18} aria-hidden />
              شماره‌گذاری جدید
            </Button>
          )
        }
      />

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
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-foreground">
                            {rule.entity_title}
                          </span>
                          {!rule.is_system && (
                            <Badge tone="neutral" className="px-1.5 py-0 text-[10px]">
                              سفارشی
                            </Badge>
                          )}
                        </div>
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
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="secondary"
                          onClick={() => view.open(rule)}
                          className="gap-1.5"
                        >
                          <PencilSimpleIcon size={16} aria-hidden />
                          {view.workspace.canWrite ? "ویرایش" : "مشاهده"}
                        </Button>
                        {!rule.is_system && view.workspace.canWrite && (
                          <Button
                            variant="ghost"
                            onClick={() => view.setDeleting(rule)}
                            className="text-danger hover:bg-danger-soft/20"
                            aria-label={`حذف شماره‌گذاری ${rule.entity_title}`}
                          >
                            <TrashIcon size={16} aria-hidden />
                          </Button>
                        )}
                      </div>
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

      <Drawer
        title={
          view.isCreating
            ? "تعریف شماره‌گذاری جدید"
            : `ویرایش شماره‌گذاری: ${view.editing?.entity_title || ""}`
        }
        open={view.editing !== undefined}
        onOpenChange={(open) => {
          if (!open) view.close();
        }}
      >
        {view.editing !== undefined && (
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
                <p className="mb-1.5 text-xs font-medium text-muted">
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

              {view.isCreating && (
                <>
                  <Field
                    id="rule-title"
                    name="entity_title"
                    label="عنوان موجودیت"
                    description="عنوان نمایشی موجودیت در سیستم (مانند قرارداد یا حواله)"
                  >
                    <Input
                      id="rule-title"
                      required
                      maxLength={120}
                      placeholder="مثال: قرارداد پیمانکاری یا حواله اموال"
                      value={view.value.entity_title}
                      onChange={(e) => view.change({ entity_title: e.target.value })}
                    />
                  </Field>

                  <Field
                    id="rule-entity-type"
                    name="entity_type"
                    label="شناسه انگلیسی موجودیت"
                    description="شناسه یکتا با حروف انگلیسی، اعداد یا خط تیره (مانند custom_contract)"
                  >
                    <Input
                      id="rule-entity-type"
                      required
                      dir="ltr"
                      pattern="^[a-zA-Z0-9_-]+$"
                      maxLength={60}
                      placeholder="custom_contract"
                      value={view.value.entity_type}
                      onChange={(e) => view.change({ entity_type: e.target.value })}
                    />
                  </Field>
                </>
              )}

              {!view.isCreating && (
                <Field id="rule-title" name="entity_title" label="عنوان موجودیت">
                  <Input
                    id="rule-title"
                    required
                    maxLength={120}
                    value={view.value.entity_title}
                    onChange={(e) => view.change({ entity_title: e.target.value })}
                  />
                </Field>
              )}

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
                      view.change({
                        current_number: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
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
                      view.change({
                        start_number: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
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

              {!view.isCreating && view.editing?.is_system && (
                <div className="rounded-control border border-warning/20 bg-warning-soft/30 p-3 text-xs leading-relaxed text-warning">
                  توجه: سیستم شماره‌گذاری پیش‌فرض برای این موجودیت غیرقابل حذف است و تنها امکان ویرایش مقادیر آن وجود دارد.
                </div>
              )}
            </fieldset>

            <FormMessage error>{view.command.error?.message}</FormMessage>

            <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
              {!view.isCreating && view.editing && !view.editing.is_system && view.workspace.canWrite ? (
                <Button
                  variant="danger"
                  type="button"
                  onClick={() => {
                    if (view.editing) view.setDeleting(view.editing);
                  }}
                >
                  حذف قاعده
                </Button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={view.close} type="button">
                  انصراف
                </Button>
                {view.workspace.canWrite && (
                  <Button type="submit" busy={view.command.busy}>
                    {view.isCreating ? "افزودن شماره‌گذاری" : "ذخیره تغییرات"}
                  </Button>
                )}
              </div>
            </div>
          </Form>
        )}
      </Drawer>

      <ConfirmDialog
        title="قاعده شماره‌گذاری حذف شود؟"
        open={!!view.deleting}
        onOpenChange={(open) => {
          if (!open) view.setDeleting(null);
        }}
        busy={view.command.busy}
        onConfirm={view.remove}
      >
        <p className="text-sm font-medium text-foreground">
          قاعده شماره‌گذاری «{view.deleting?.entity_title}» (شناسه:{" "}
          <span className="font-mono text-primary">{view.deleting?.entity_type}</span>)
          حذف خواهد شد. آیا مطمئن هستید؟
        </p>
      </ConfirmDialog>
    </>
  );
}
