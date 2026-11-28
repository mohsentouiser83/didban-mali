"use client";

import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import {
  HashIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { DetailField } from "@/components/ui/field-layout";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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
import { persian } from "@/lib/utils";
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
        title="شماره‌گذاری"
        icon={HashIcon}
        action={
          view.workspace.canWrite && (
            <Button onClick={() => view.open(null)}>
              <PlusIcon size={18} aria-hidden />
              قاعده سفارشی جدید
            </Button>
          )
        }
      />

      <Panel title="قواعد شماره‌گذاری موجودیت‌ها و اسناد">
        {view.resource.loading ? (
          <LoadingState label="در حال دریافت قواعد شماره‌گذاری..." />
        ) : view.resource.error ? (
          <ErrorState
            message={view.resource.error.message}
            onRetry={view.resource.refresh}
          />
        ) : (
          <Table title="قواعد شماره‌گذاری">
            <TableHeader>
              <TableRow>
                <TableHead>موجودیت و کاربرد</TableHead>
                <TableHead>نوع قاعده</TableHead>
                <TableHead>پیشوند</TableHead>
                <TableHead numeric>شمارنده</TableHead>
                <TableHead numeric>حداقل رقم</TableHead>
                <TableHead>پسوند</TableHead>
                <TableHead>شمارهٔ قابل تخصیص / نمونه</TableHead>
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
                        <span className="text-xs text-muted">
                          {rule.connected_process ||
                            "سفارشی — متصل به فرایند خودکار نیست"}
                        </span>
                      </div>
                    </TableRowHeader>
                    <TableCell>
                      <Badge tone={rule.is_system ? "primary" : "neutral"}>
                        {rule.is_system ? "سیستمی" : "سفارشی"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {rule.prefix ? (
                        <span dir="ltr" className="font-mono font-medium text-primary">
                          {rule.prefix}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell numeric>
                      <span className="font-mono tabular-nums text-foreground">
                        {persian(rule.current_number)}
                      </span>
                    </TableCell>
                    <TableCell numeric>
                      <span className="text-muted tabular-nums">
                        {persian(rule.padding)} رقم
                      </span>
                    </TableCell>
                    <TableCell>
                      {rule.suffix ? (
                        <span dir="ltr" className="font-mono font-medium text-primary">
                          {rule.suffix}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone="primary" className="font-mono text-xs tracking-wider">
                        <bdi>{rule.next_number ?? rule.sample}</bdi>
                        {!rule.next_number && <span className="ms-1"> (نمونهٔ الگو)</span>}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge tone={rule.active ? "success" : "neutral"}>
                        {rule.active ? "فعال" : "غیرفعال"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TableRowActions label={`عملیات ${rule.entity_title}`}>
                        <TableRowAction
                          onClick={() => view.open(rule)}
                          icon={<PencilSimpleIcon size={16} aria-hidden />}
                        >
                          {view.workspace.canWrite ? "ویرایش" : "مشاهده"}
                        </TableRowAction>
                        {!rule.is_system && view.workspace.canWrite && (
                          <TableRowAction
                            onClick={() => view.setDeleting(rule)}
                            aria-label={`حذف شماره‌گذاری ${rule.entity_title}`}
                            icon={<TrashIcon size={16} aria-hidden />}
                            danger
                          >
                            حذف
                          </TableRowAction>
                        )}
                      </TableRowActions>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell
                  colSpan={9}
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
            ? "تعریف قاعده شماره‌گذاری سفارشی"
            : `جزئیات و ویرایش شماره‌گذاری: ${view.editing?.entity_title || ""}`
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
              <div className="rounded-control border border-border bg-canvas/60 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted">
                    نمونهٔ الگوی فرم
                  </p>
                  <Badge tone="primary" className="font-mono text-xs">
                    الگوی خروجی
                  </Badge>
                </div>
                <div dir="ltr" className="font-mono text-xl font-bold tracking-wider text-primary text-end">
                  {view.livePreview}
                </div>
              </div>

              {!view.isCreating && view.editing && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <DetailField
                    label="شناسه فنی موجودیت"
                    value={view.editing.entity_type}
                    icon={HashIcon}
                  />
                  <DetailField
                    label="اتصال به فرایند"
                    value={
                      view.editing.connected_process ||
                      "سفارشی (فقط فراخوانی از API شماره‌گذاری)"
                    }
                    icon={HashIcon}
                  />
                </div>
              )}

              {view.isCreating ? (
                <>
                  <Badge>فقط API شماره‌گذاری</Badge>
                  <Field
                    id="rule-title"
                    name="entity_title"
                    label="عنوان موجودیت"
                    required
                  >
                    <Input
                      id="rule-title"
                      required
                      maxLength={120}
                      value={view.value.entity_title}
                      onChange={(e) => view.change({ entity_title: e.target.value })}
                    />
                  </Field>

                  <Field
                    id="rule-entity-type"
                    name="entity_type"
                    label="شناسه فنی انگلیسی"
                    required
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
              ) : (
                <Field id="rule-title" name="entity_title" label="عنوان موجودیت" required>
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
                  dir="ltr"
                  maxLength={30}
                  value={view.value.prefix}
                  onChange={(e) => view.change({ prefix: e.target.value })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  id="rule-current"
                  label="شمارنده"
                  required
                >
                  <Input
                    id="rule-current"
                    type="number"
                    dir="ltr"
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

                <Field
                  id="rule-start"
                  label="شماره شروع"
                  required
                >
                  <Input
                    id="rule-start"
                    type="number"
                    dir="ltr"
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
                <Field
                  id="rule-padding"
                  label="حداقل تعداد رقم"
                  required
                >
                  <Input
                    id="rule-padding"
                    type="number"
                    dir="ltr"
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
                    dir="ltr"
                    maxLength={30}
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


              {view.willDeactivate && view.editing && (
                <StatusMessage tone="danger">
                  {view.editing.deactivation_impact ||
                    (view.editing.connected_process
                      ? `هشدار: غیرفعالسازی این قاعده، فرایند «${view.editing.connected_process}» را متوقف می‌کند.`
                      : "غیرفعالسازی این قاعده، تخصیص شماره از مسیر آن را متوقف می‌کند.")}
                </StatusMessage>
              )}

              {!view.isCreating && view.editing?.is_system && (
                <StatusMessage tone="warning">
                  قاعدهٔ سیستمی قابل حذف نیست.
                </StatusMessage>
              )}
            </fieldset>

            <FormMessage error>{view.command.error?.message}</FormMessage>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4">
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
              ) : null}

              <Button variant="secondary" onClick={view.close} type="button">
                انصراف
              </Button>
              {view.workspace.canWrite && (
                <Button type="submit" busy={view.command.busy}>
                  {view.isCreating ? "افزودن شماره‌گذاری" : "ذخیره تغییرات"}
                </Button>
              )}
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
