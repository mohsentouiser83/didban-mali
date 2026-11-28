"use client";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { useState } from "react";
import { AccountEditor } from "./account-editor";
import { TableColumnSelect } from "@/components/ui/table-column-select";
import {
  ACCOUNT_LEVEL_OPTIONS,
  accountLevelLabel,
  accountPostableStatus,
  accountRoleLabel,
  treasuryRoleLabel,
} from "@/lib/account-catalogue";
import {
  BooksIcon,
  CaretDownIcon,
  CaretLeftIcon,
  FileArrowUpIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { moduleAllows } from "@/lib/module-access";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { CursorPagination, Pagination } from "@/components/ui/pagination";
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
import { ChartSetupPanel } from "./chart-setup-panel";
import { useLedgerAccounts } from "@/hooks/use-accounting";
import { useWorkspace } from "@/hooks/workspace";
import { cn, persian } from "@/lib/utils";
import { accountNatureLabel } from "@/lib/accounting";
import { NoCompany, PageHeader, Panel } from "./page-parts";

const depthPadding = ["", "ps-[22px]", "ps-[44px]", "ps-[66px]"];

export function AccountsView() {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return <AccountsWorkspace key={workspace.company.id} />;
}
function AccountsWorkspace() {
  const view = useLedgerAccounts();
  const [importOpen, setImportOpen] = useState(false);
  const managesAccounts = !!view.capabilities.data?.can_manage_accounts;
  const canCreate = moduleAllows(view.workspace.company, "accounting", "create", managesAccounts);
  const canEdit = moduleAllows(view.workspace.company, "accounting", "edit", managesAccounts);
  const loading =
    (view.serverFiltersActive ? view.resource.loading : view.catalogue.loading) ||
    view.capabilities.loading;
  const error =
    (view.serverFiltersActive ? view.resource.error : view.catalogue.error) ||
    view.capabilities.error;
  const levelTone = (level?: string | null) =>
    level === "group"
      ? "primary"
      : level === "general"
        ? "success"
        : level === "subsidiary"
          ? "warning"
          : "neutral";
  return (
    <>
      <PageHeader
        title="کدینگ حساب‌ها"
        icon={BooksIcon}
        action={canCreate && (
          <Button onClick={() => view.open(null)}>
            <PlusIcon size={18} aria-hidden />
            حساب جدید
          </Button>
        )}
      />
      <Panel>
        {(canCreate || view.hasExpandableNodes) && (
          <div className="mb-3 flex flex-wrap justify-end gap-2">
            {view.hasExpandableNodes && (
              <Button variant="ghost" onClick={view.allCollapsed ? view.expandAll : view.collapseAll}>
                {view.allCollapsed ? "باز کردن همه" : "بستن همه"}
              </Button>
            )}
            {canCreate && (
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <FileArrowUpIcon size={18} aria-hidden />
                ورود از فایل
              </Button>
            )}
          </div>
        )}
        {loading ? (
          <LoadingState label="در حال دریافت حساب‌ها" variant="panels" />
        ) : error ? (
          <ErrorState
            message={error.message}
            onRetry={() => {
              view.refresh();
              view.capabilities.refresh();
            }}
          />
        ) : (
          <>
            <Table title="کدینگ حساب‌ها">
              <TableHeader>
                <TableRow>
                  <TableHead columnFilter={view.columnFilter("code")}>کد</TableHead>
                  <TableHead columnFilter={view.columnFilter("name")}>نام</TableHead>
                  <TableHead columnControl={
                    <TableColumnSelect columnTitle="سطح" value={view.levelFilter} onValueChange={view.setLevelFilter}
                      options={[{ value: "all", label: "همه سطح‌ها" }, ...ACCOUNT_LEVEL_OPTIONS, { value: "unclassified", label: "تعیین‌نشده" }]} />
                  }>سطح</TableHead>
                  <TableHead columnControl={
                    <TableColumnSelect columnTitle="حساب بالادست" value={view.parentFilter} onValueChange={view.setParentFilter}
                      searchable disabled={!view.canFilterParent || view.catalogue.loading || !!view.catalogue.error}
                      options={[{ value: "all", label: "همه حساب‌ها" }, ...view.filterParentOptions]} />
                  }>حساب بالادست</TableHead>
                  <TableHead columnFilter={view.columnFilter("nature")}>ماهیت</TableHead>
                  <TableHead columnFilter={view.columnFilter("role")}>نقش</TableHead>
                  <TableHead columnFilter={view.columnFilter("status")}>وضعیت</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.treeRows.length ? (
                  view.treeRows.map(({ account, depth, hasChildren, childCount, expanded, childLevel }) => {
                    const postableInfo = accountPostableStatus(account);
                    return (
                    <TableRow
                      key={account.id}
                      className={cn(
                        depth === 0 && account.level === "group" && "bg-canvas/70",
                      )}
                    >
                      <TableRowHeader>
                        <div
                          className={cn("flex items-center gap-1.5", depthPadding[depth])}
                        >
                          {depth > 0 && (
                            <span
                              aria-hidden
                              className="inline-block h-4 w-2.5 shrink-0 border-b border-s border-border"
                            />
                          )}
                          {!view.filtersActive && hasChildren ? (
                            <Button
                              variant="ghost"
                              aria-expanded={expanded}
                              aria-label={`${expanded ? "بستن" : "باز کردن"} زیرمجموعه ${account.name}`}
                              onClick={() => view.toggleExpand(account.id)}
                              className="size-6 min-h-0 rounded-md p-0"
                            >
                              {expanded ? (
                                <CaretDownIcon size={14} weight="bold" aria-hidden />
                              ) : (
                                <CaretLeftIcon size={14} weight="bold" aria-hidden />
                              )}
                            </Button>
                          ) : (
                            <span className="inline-block size-6 shrink-0" aria-hidden />
                          )}
                          <span
                            dir="ltr"
                            className={cn(
                              "inline-block font-mono",
                              depth <= 1 ? "font-semibold text-foreground" : "text-foreground",
                            )}
                          >
                            {account.code}
                          </span>
                        </div>
                      </TableRowHeader>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={cn(depth <= 1 && "font-medium text-foreground")}>
                            {account.name}
                          </span>
                          {!view.filtersActive && hasChildren && (
                            <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted tabular-nums">
                              {persian(childCount)} زیرمجموعه
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge tone={levelTone(account.level)}>
                          {account.level === "detail" && !account.parent_id
                            ? "تفصیلی شناور"
                            : accountLevelLabel(account.level)}
                        </Badge>
                      </TableCell>
                      <TableCell>{account.parent_code ? <><bdi>{account.parent_code}</bdi> — {account.parent_name}</> : "—"}</TableCell>
                      <TableCell>
                        <Badge
                          tone={
                            account.nature === "credit"
                              ? "success"
                              : account.nature === "floating"
                                ? "warning"
                                : account.nature === "none"
                                  ? "neutral"
                                  : "primary"
                          }
                        >
                          {accountNatureLabel(account.nature)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {account.role ? (
                          <Badge
                            tone={
                              ["bank", "cash", "petty_cash", "cash_bank"].includes(
                                account.role,
                              )
                                ? "primary"
                                : "neutral"
                            }
                          >
                            {treasuryRoleLabel(account.role) ||
                              accountRoleLabel(account.role)}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge tone={account.active ? "success" : "neutral"}>
                              {account.active ? "فعال" : "غیرفعال"}
                            </Badge>
                            <Badge tone={postableInfo.postable ? "primary" : "neutral"}>
                              {postableInfo.label}
                            </Badge>
                          </div>
                          {!postableInfo.postable && postableInfo.reason && (
                            <span className="text-[11px] text-muted">
                              {postableInfo.reason}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <TableRowActions label={`عملیات ${account.name}`}>
                          {canCreate && childLevel && account.can_add_standard_child !== false && (
                            <TableRowAction
                              onClick={() => view.openChild(account)}
                              icon={<PlusIcon size={14} aria-hidden />}
                            >
                              {childLevel === "detail" ? "تفصیلی شناور" : accountLevelLabel(childLevel)}
                            </TableRowAction>
                          )}
                          <TableRowAction
                            onClick={() => view.open(account)}
                            kind="edit"
                          >
                            {canEdit ? "ویرایش" : "مشاهده"}
                          </TableRowAction>
                        </TableRowActions>
                      </TableCell>
                    </TableRow>
                    );
                  })
                ) : (
                  <TableEmptyCell colSpan={8} title={view.filtersActive ? "حسابی برای این فیلترها پیدا نشد" : "هنوز حسابی تعریف نشده است"} />
                )}
              </TableBody>
            </Table>
            {view.serverFiltersActive ? <CursorPagination {...view.resource} /> : <Pagination {...view.localPagination} />}
          </>
        )}
      </Panel>
      <Drawer
        title={view.editing ? "ویرایش حساب" : "حساب جدید"}
        open={view.editing !== undefined}
        onOpenChange={(open) => {
          if (!open && !view.command.busy) view.close();
        }}
      >
        <AccountEditor view={view} editable={view.editing ? canEdit : canCreate} />
      </Drawer>
      {canCreate && (
        <Drawer
          title="الگو و ورود کدینگ حساب‌ها"
          open={importOpen}
          className="sm:max-w-4xl"
          onOpenChange={(open) => {
            if (!open) setImportOpen(false);
          }}
        >
          <ChartSetupPanel
            onImported={() => {
              setImportOpen(false);
              view.refresh();
            }}
          />
        </Drawer>
      )}
    </>
  );
}
