"use client";
import { ArchiveIcon, BooksIcon, EyeIcon, PencilSimpleIcon, PlusIcon, PowerIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { DetailField, DetailGroup } from "@/components/ui/field-layout";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CursorPagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";
import { useDimensionManagement } from "@/hooks/use-dimensions";
import { useWorkspace } from "@/hooks/workspace";
import { dimensionKinds } from "@/lib/dimensions";
import { persian } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function DimensionsManagementView() {
  const workspace = useWorkspace();
  return workspace.company ? (
    <Workspace key={workspace.company.id} />
  ) : (
    <NoCompany />
  );
}

function Workspace() {
  const view = useDimensionManagement();
  const kindLabel = (kind: string) =>
    dimensionKinds.find((k) => k.value === kind)?.label || kind;

  const validImportCount =
    view.importPreview?.filter((row) => !row.error).length ?? 0;
  const invalidImportCount =
    view.importPreview?.filter((row) => !!row.error).length ?? 0;

  return (
    <>
      <PageHeader
        title="پروژه، شعبه و مرکز هزینه"
        icon={BooksIcon}
        action={
          <div className="flex flex-wrap gap-2">
            {view.workspace.canWrite && (
              <Button onClick={() => view.open(null)}>
                <PlusIcon size={18} aria-hidden />
                افزودن مورد جدید
              </Button>
            )}
          </div>
        }
      />

      <Panel>
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64">
            <SearchInput
              label="جستجوی نام یا کد..."
              value={view.search}
              onChange={(e) => view.setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-44">
            <Field id="dimension-kind-filter" label="نوع">
              <Select
                id="dimension-kind-filter"
                value={view.kindFilter}
                onValueChange={view.setKindFilter}
                options={[
                  { value: "all", label: "همه انواع" },
                  ...dimensionKinds,
                ]}
              />
            </Field>
          </div>
          <div className="w-full sm:w-40">
            <Field id="dimension-status-filter" label="وضعیت">
              <Select
                id="dimension-status-filter"
                value={view.statusFilter}
                onValueChange={(v) =>
                  view.setStatusFilter(v as "all" | "active" | "archived")
                }
                options={[
                  { value: "all", label: "همه وضعیت‌ها" },
                  { value: "active", label: "فعال" },
                  { value: "archived", label: "بایگانی" },
                ]}
              />
            </Field>
          </div>
          {view.hasActiveFilters && (
            <Button variant="ghost" onClick={view.resetFilters}>
              پاک‌کردن فیلترها
            </Button>
          )}
        </div>

        {view.resource.loading ? (
          <LoadingState label="در حال دریافت فهرست پروژه، شعبه و مرکز هزینه" />
        ) : view.resource.error ? (
          <ErrorState
            message={view.resource.error.message}
            onRetry={view.resource.refresh}
          />
        ) : (
          <>
            <Table
              showSearch={false}
              title="پروژه، شعبه و مرکز هزینه"
              onImport={view.workspace.canWrite ? view.importFromExcel : undefined}
            >
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>کد</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.length ? (
                  view.rows.map((item) => (
                    <TableRow key={item.id}>
                      <TableRowHeader>{item.name}</TableRowHeader>
                      <TableCell dir="ltr" className="font-mono">
                        {item.code}
                      </TableCell>
                      <TableCell>{kindLabel(item.kind)}</TableCell>
                      <TableCell>
                        <Badge tone={item.active ? "success" : "neutral"}>
                          {item.active ? "فعال" : "بایگانی"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            variant="ghost"
                            className="h-9 px-2.5 text-xs"
                            onClick={() => view.open(item, true)}
                          >
                            <EyeIcon size={15} aria-hidden />
                            مشاهده
                          </Button>
                          {view.workspace.canWrite && (
                            <>
                              <Button
                                variant="secondary"
                                className="h-9 px-2.5 text-xs"
                                onClick={() => view.open(item, false)}
                              >
                                <PencilSimpleIcon size={15} aria-hidden />
                                ویرایش
                              </Button>
                              <Button
                                variant="ghost"
                                className={
                                  item.active
                                    ? "h-9 px-2.5 text-xs text-warning hover:bg-warning-soft/40"
                                    : "h-9 px-2.5 text-xs text-success hover:bg-success-soft/40"
                                }
                                onClick={() => {
                                  view.command.clearError();
                                  view.setArchiving(item);
                                }}
                              >
                                {item.active ? (
                                  <>
                                    <ArchiveIcon size={15} aria-hidden />
                                    بایگانی
                                  </>
                                ) : (
                                  <>
                                    <PowerIcon size={15} aria-hidden />
                                    فعال‌سازی مجدد
                                  </>
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell
                    colSpan={5}
                    title={
                      view.hasActiveFilters
                        ? "موردی با این فیلتر یافت نشد"
                        : "پروژه، شعبه یا مرکز هزینه‌ای تعریف نشده"
                    }
                  />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...view.resource} />
          </>
        )}
      </Panel>

      <Drawer
        title={
          view.editing
            ? view.readOnly
              ? `مشاهده: ${view.editing.name}`
              : `ویرایش: ${view.editing.name}`
            : "تعریف پروژه، شعبه یا مرکز هزینه"
        }
        open={view.editing !== undefined}
        onOpenChange={(open) => {
          if (!open) view.close();
        }}
      >
        {view.readOnly && view.editing ? (
          <div className="space-y-4">
            <DetailGroup>
              <DetailField label="نام" value={view.editing.name} icon={BooksIcon} />
              <DetailField label="کد" value={view.editing.code} icon={BooksIcon} />
              <DetailField label="نوع" value={kindLabel(view.editing.kind)} icon={BooksIcon} />
              <DetailField
                label="وضعیت"
                value={view.editing.active ? "فعال (قابل انتخاب در اسناد جدید)" : "بایگانی (سابقه حفظ شده)"}
                icon={BooksIcon}
              />
            </DetailGroup>
            <StatusMessage tone="primary">
              بایگانی یا تغییر عنوان، معنای تخصیص‌های ثبت‌شده و گزارش‌های تاریخی این پروژه، شعبه یا مرکز هزینه را تغییر نمی‌دهد.
            </StatusMessage>
          </div>
        ) : (
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
              {!view.editing ? (
                <StatusMessage tone="primary">
                  کد یکتای این رکورد به‌صورت خودکار از قاعدهٔ شماره‌گذاری «پروژه و مرکز هزینه» تخصیص پیدا می‌کند.
                </StatusMessage>
              ) : (
                <DetailField label="کد ثبت‌شده" value={view.editing.code} icon={BooksIcon} />
              )}

              <Field
                id="dimension-kind"
                label="نوع"
                description={
                  view.editing
                    ? "نوع رکورد پس از ثبت تغییر نمی‌کند تا معنای گزارش‌های تاریخی حفظ شود."
                    : undefined
                }
                required
              >
                <Select
                  id="dimension-kind"
                  value={view.value.kind}
                  options={dimensionKinds}
                  disabled={!!view.editing || view.command.busy}
                  onValueChange={(kind) => view.change({ kind })}
                />
              </Field>

              <Field id="dimension-name" label="نام" required>
                <Input
                  id="dimension-name"
                  required
                  maxLength={120}
                  value={view.value.name}
                  onChange={(event) => view.change({ name: event.target.value })}
                />
              </Field>

              <Checkbox
                id="dimension-active"
                label="فعال (قابل انتخاب در اسناد و تخصیص‌های جدید)"
                checked={view.value.active}
                onCheckedChange={(active) => view.change({ active })}
              />

              {view.editing && !view.value.active && (
                <StatusMessage tone="warning">
                  بایگانی کردن مانع انتخاب این مورد در تخصیص‌های جدید می‌شود، ولی تخصیص‌های قبلی و گزارش‌های تاریخی بدون تغییر باقی می‌مانند.
                </StatusMessage>
              )}
            </fieldset>
            <FormMessage error>{view.command.error?.message}</FormMessage>
            {view.workspace.canWrite && (
              <Button type="submit" busy={view.command.busy}>
                ذخیره
              </Button>
            )}
          </Form>
        )}
      </Drawer>

      <ConfirmDialog
        title={
          view.archiving?.active
            ? "پروژه، شعبه یا مرکز هزینه بایگانی شود؟"
            : "فعال‌سازی مجدد"
        }
        open={!!view.archiving}
        onOpenChange={(open) => {
          if (!open) view.setArchiving(null);
        }}
        busy={view.command.busy}
        onConfirm={view.toggleArchive}
      >
        <p className="font-medium text-foreground">
          {view.archiving?.name} ({view.archiving?.code})
        </p>
        <p className="text-xs text-muted">
          {view.archiving?.active
            ? "با بایگانی کردن، تخصیص‌های ثبت‌شدهٔ پیشین و گزارش‌های تاریخی دست‌نخورده می‌مانند و فقط انتخاب آن در ثبت‌های جدید بسته می‌شود."
            : "با فعال‌سازی مجدد، این مورد دوباره در انتخاب‌های سند و گزارش در دسترس قرار می‌گیرد."}
        </p>
        <FormMessage error>{view.command.error?.message}</FormMessage>
      </ConfirmDialog>

      <Drawer
        title="پیش‌نمایش ورود اکسل پروژه، شعبه و مرکز هزینه"
        open={view.importPreview !== null}
        className="sm:max-w-3xl"
        onOpenChange={(open) => {
          if (!open) view.closeImport();
        }}
      >
        {view.importPreview && (
          <div className="space-y-4">
            <StatusMessage tone="primary">
              کد هر مورد هنگام ثبت نهایی به‌صورت خودکار توسط سامانه از شماره‌گذاری شرکت تخصیص داده می‌شود.
            </StatusMessage>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="success">{persian(validImportCount)} ردیف معتبر</Badge>
              {invalidImportCount > 0 && (
                <Badge tone="danger">{persian(invalidImportCount)} ردیف خطادار</Badge>
              )}
            </div>
            <Table showSearch={false}>
              <TableHeader>
                <TableRow>
                  <TableHead>ردیف</TableHead>
                  <TableHead>نام</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>وضعیت بررسی</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.importPreview.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell>{persian(row.rowNumber)}</TableCell>
                    <TableCell>{row.name || "—"}</TableCell>
                    <TableCell>{kindLabel(row.kind)}</TableCell>
                    <TableCell>
                      {row.error ? (
                        <Badge tone="danger">{row.error}</Badge>
                      ) : (
                        <Badge tone="success">معتبر</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {view.importSummary && (
              <div className="space-y-2 rounded-control border border-border p-3 text-xs">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="success">
                    ثبت موفق: {persian(view.importSummary.succeeded)}
                  </Badge>
                  {view.importSummary.failed > 0 && (
                    <Badge tone="danger">
                      ناموفق: {persian(view.importSummary.failed)}
                    </Badge>
                  )}
                </div>
                {view.importSummary.errors.length > 0 && (
                  <ul className="list-inside list-disc text-danger space-y-1">
                    {view.importSummary.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={view.closeImport} disabled={view.importBusy}>
                بستن
              </Button>
              <Button
                busy={view.importBusy}
                disabled={!validImportCount || view.importBusy}
                onClick={() => void view.applyImport()}
              >
                ثبت {persian(validImportCount)} ردیف معتبر
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
