"use client";
import { useState } from "react";
import { AccountEditor } from "./account-editor";
import { AccountFilters } from "./account-filters";
import {
  accountLevelLabel,
  accountPostableStatus,
  accountRoleLabel,
  treasuryRoleLabel,
} from "@/lib/account-catalogue";
import {
  BankIcon,
  BooksIcon,
  CaretDownIcon,
  CaretLeftIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
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

export function AccountsView() {
  const workspace = useWorkspace();
  if (!workspace.company) return <NoCompany />;
  return <AccountsWorkspace key={workspace.company.id} />;
}
function AccountsWorkspace() {
  const view = useLedgerAccounts();
  const [importOpen, setImportOpen] = useState(false);
  const editable = !!view.capabilities.data?.can_manage_accounts;
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
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink variant="secondary" href="/settings/treasury">
              <BankIcon size={18} aria-hidden />
              حساب‌های خزانه
            </ButtonLink>
            {editable && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setImportOpen(true)}
                >
                  الگو و ورود کدینگ
                </Button>
                <Button onClick={() => view.open(null)}>
                  <PlusIcon size={18} aria-hidden />
                  حساب جدید
                </Button>
              </>
            )}
          </div>
        }
      />
      <div className="mb-4">
        <StatusMessage tone="primary">
          ثبت سند فقط روی حساب‌های فعال بدون زیرمجموعه (خارج از سطح گروه) مجاز است. حساب‌های ذخیره، هزینه و برگشت کاهش ارزش موجودی (استاندارد ۸ — D35) از طریق فیلد «نقش حساب» در کدینگ تنظیم می‌شوند.
        </StatusMessage>
      </div>
      <Panel>
        <AccountFilters view={view} />
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
            <Table showSearch={false} title="کدینگ حساب‌ها">
              <TableHeader>
                <TableRow>
                  <TableHead>کد</TableHead>
                  <TableHead>نام</TableHead>
                  <TableHead>سطح</TableHead>
                  <TableHead>حساب بالادست</TableHead>
                  <TableHead>ماهیت</TableHead>
                  <TableHead>نقش</TableHead>
                  <TableHead>وضعیت</TableHead>
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
                          className="flex items-center gap-1.5"
                          style={depth > 0 ? { paddingInlineStart: `${depth * 22}px` } : undefined}
                        >
                          {depth > 0 && (
                            <span
                              aria-hidden
                              className="inline-block h-4 w-2.5 shrink-0 border-b border-s border-border"
                            />
                          )}
                          {!view.filtersActive && hasChildren ? (
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-label={`${expanded ? "بستن" : "باز کردن"} زیرمجموعه ${account.name}`}
                              onClick={() => view.toggleExpand(account.id)}
                              className="grid size-6 shrink-0 place-items-center rounded-md text-secondary transition-colors hover:bg-primary-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              {expanded ? (
                                <CaretDownIcon size={14} weight="bold" aria-hidden />
                              ) : (
                                <CaretLeftIcon size={14} weight="bold" aria-hidden />
                              )}
                            </button>
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
                          {account.code_status === "legacy" && (
                            <Badge tone="warning">کد قدیمی</Badge>
                          )}
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
                          {accountLevelLabel(account.level)}
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
                        <div className="flex items-center gap-1.5">
                          {editable && childLevel && account.can_add_standard_child !== false && (
                            <Button
                              variant="ghost"
                              className="h-8 gap-1 px-2 text-xs text-primary hover:bg-primary-soft"
                              onClick={() => view.openChild(account)}
                            >
                              <PlusIcon size={14} aria-hidden />
                              {accountLevelLabel(childLevel)}
                            </Button>
                          )}
                          <Button
                            variant="secondary"
                            onClick={() => view.open(account)}
                          >
                            {editable ? "ویرایش" : "مشاهده"}
                          </Button>
                        </div>
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
        <AccountEditor view={view} editable={editable} />
      </Drawer>
      {editable && (
        <Drawer
          title="الگو و ورود کدینگ حساب‌ها"
          open={importOpen}
          className="sm:max-w-4xl"
          onOpenChange={(open) => {
            if (!open) setImportOpen(false);
          }}
        >
          <ChartSetupPanel
            embedded
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
