"use client";

import { useMemo, useState } from "react";
import {
  BankIcon,
  EyeIcon,
  PencilSimpleIcon,
  PlusIcon,
  PowerIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { SearchInput } from "@/components/ui/search-input";
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
import type { AccountingCapabilities } from "@/lib/accounting";
import { amount } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import {
  TreasuryAccountDrawer,
  type TreasuryAccountItem,
  type TreasuryType,
} from "./treasury-account-drawer";

const KIND_LABELS: Record<TreasuryType, string> = {
  bank: "بانک",
  cash: "صندوق",
  petty_cash: "تنخواه‌گردان",
};

function maskIdentifier(raw?: string | null): string {
  const value = (raw || "").trim();
  if (!value) return "";
  if (value.length <= 6) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function TreasuryAccountsView() {
  const workspace = useWorkspace();
  return workspace.company ? (
    <TreasuryWorkspace key={workspace.company.id} />
  ) : (
    <NoCompany />
  );
}

function TreasuryWorkspace() {
  const workspace = useWorkspace();
  const capabilities = useResource<AccountingCapabilities>(
    workspace.companyPath("accounting/capabilities"),
  );
  const canManage = capabilities.data?.can_manage_accounts === true;
  const resource = useResource<{ items: TreasuryAccountItem[] }>(
    canManage ? workspace.companyPath("treasury/accounts") : null,
  );
  const toggleCommand = useCommand();

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | TreasuryType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [drawerState, setDrawerState] = useState<{
    open: boolean;
    editing: TreasuryAccountItem | null;
    readOnly: boolean;
  }>({ open: false, editing: null, readOnly: false });
  const [toggling, setToggling] = useState<TreasuryAccountItem | null>(null);

  const items = useMemo(() => resource.data?.items ?? [], [resource.data]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (statusFilter === "active" && !item.active) return false;
      if (statusFilter === "inactive" && item.active) return false;
      if (!q) return true;
      const haystack = [
        item.name,
        item.bank_name,
        item.account_number,
        item.iban,
        item.branch_name,
        item.custodian_name,
        item.account_code,
        item.account_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, kindFilter, search, statusFilter]);

  const linkedAccountIds = useMemo(
    () => items.map((item) => item.account_id),
    [items],
  );

  function confirmToggleActive() {
    if (!toggling) return;
    const nextActive = !toggling.active;
    void toggleCommand.run(
      workspace.companyPath(`treasury/accounts/${toggling.id}`),
      {
        method: "PATCH",
        version: toggling.version,
        body: { active: nextActive },
      },
      () => {
        setToggling(null);
        resource.refresh();
      },
      nextActive ? "حساب خزانه فعال شد." : "حساب خزانه غیرفعال شد.",
    );
  }

  if (capabilities.loading || capabilities.error || !canManage) {
    return (
      <>
        <PageHeader title="حساب‌های خزانه" icon={BankIcon} />
        {capabilities.loading ? (
          <LoadingState label="در حال بررسی دسترسی خزانه" />
        ) : capabilities.error ? (
          <ErrorState message={capabilities.error.message} onRetry={capabilities.refresh} />
        ) : (
          <StatusMessage>مشاهدهٔ جزئیات حساب‌های خزانه به مجوز مدیریت حساب‌ها نیاز دارد.</StatusMessage>
        )}
      </>
    );
  }
  return (
    <>
      <PageHeader
        title="حساب‌های خزانه"
        icon={BankIcon}
        action={
          canManage && (
            <Button
              onClick={() =>
                setDrawerState({ open: true, editing: null, readOnly: false })
              }
            >
              <PlusIcon size={18} aria-hidden />
              تعریف حساب خزانه
            </Button>
          )
        }
      />

      <div className="mb-4">
        <StatusMessage tone="primary">
          هر حساب خزانه (بانک، صندوق یا تنخواه‌گردان) به یک سرفصل دفتر در کدینگ حساب‌ها متصل است. غیرفعالسازی حساب خزانه، انتخاب آن را در دریافت و پرداخت‌های جدید متوقف می‌کند و سوابق پیشین را حفظ می‌نماید.
        </StatusMessage>
      </div>

      <Panel>
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64">
            <SearchInput
              label="جستجو در نام، حساب دفتر، بانک یا مسئول..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-44">
            <Field id="treasury-kind-filter" label="نوع حساب">
              <Select
                id="treasury-kind-filter"
                value={kindFilter}
                onValueChange={(v) => setKindFilter(v as "all" | TreasuryType)}
                options={[
                  { value: "all", label: "همه انواع" },
                  { value: "bank", label: "بانک" },
                  { value: "cash", label: "صندوق" },
                  { value: "petty_cash", label: "تنخواه‌گردان" },
                ]}
              />
            </Field>
          </div>
          <div className="w-full sm:w-40">
            <Field id="treasury-status-filter" label="وضعیت">
              <Select
                id="treasury-status-filter"
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(v as "all" | "active" | "inactive")
                }
                options={[
                  { value: "all", label: "همه وضعیت‌ها" },
                  { value: "active", label: "فعال" },
                  { value: "inactive", label: "غیرفعال" },
                ]}
              />
            </Field>
          </div>
          {(search || kindFilter !== "all" || statusFilter !== "all") && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setKindFilter("all");
                setStatusFilter("all");
              }}
            >
              پاک‌کردن فیلترها
            </Button>
          )}
        </div>

        {resource.loading || capabilities.loading ? (
          <LoadingState label="در حال دریافت حساب‌های خزانه..." variant="table" />
        ) : resource.error ? (
          <ErrorState
            message={resource.error.message}
            onRetry={resource.refresh}
          />
        ) : (
          <Table showSearch={false} title="حساب‌های خزانه">
            <TableHeader>
              <TableRow>
                <TableHead>نام</TableHead>
                <TableHead>نوع</TableHead>
                <TableHead>حساب دفتر</TableHead>
                <TableHead>شناسه بانکی / مسئول</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length ? (
                filteredItems.map((row) => (
                  <TableRow key={row.id}>
                    <TableRowHeader>
                      <div className="flex items-center gap-2">
                        {row.kind === "bank" ? (
                          <BankIcon size={16} className="shrink-0 text-primary" aria-hidden />
                        ) : (
                          <WalletIcon size={16} className="shrink-0 text-primary" aria-hidden />
                        )}
                        <span className="font-medium text-foreground">{row.name}</span>
                        {row.needs_completion && (
                          <Badge tone="warning">نیازمند تکمیل</Badge>
                        )}
                      </div>
                    </TableRowHeader>
                    <TableCell>
                      <Badge tone={row.kind === "bank" ? "primary" : "neutral"}>
                        {KIND_LABELS[row.kind]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span>
                          {row.account_code ? (
                            <>
                              <bdi className="font-mono">{row.account_code}</bdi> —{" "}
                              {row.account_name}
                            </>
                          ) : (
                            row.account_id
                          )}
                        </span>
                        {row.account_active === false && (
                          <span className="text-warning">حساب دفتر غیرفعال است</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.kind === "bank" ? (
                        <div className="flex flex-col gap-0.5 text-xs">
                          {row.bank_name && (
                            <span className="font-medium text-foreground">{row.bank_name}</span>
                          )}
                          {(row.account_number || row.iban) ? (
                            <span dir="ltr" className="font-mono text-muted">
                              {row.account_number
                                ? `حساب: ${maskIdentifier(row.account_number)}`
                                : `شبا: ${maskIdentifier(row.iban)}`}
                            </span>
                          ) : (
                            <span className="text-muted">شناسه بانکی ثبت نشده</span>
                          )}
                        </div>
                      ) : row.kind === "cash" ? (
                        <span className="text-xs text-foreground">
                          {row.custodian_name ? `مسئول: ${row.custodian_name}` : "مسئول ثبت نشده"}
                        </span>
                      ) : (
                        <div className="flex flex-col gap-0.5 text-xs">
                          <span>
                            {row.custodian_name
                              ? `تنخواه‌دار: ${row.custodian_name}`
                              : "تنخواه‌دار ثبت نشده"}
                          </span>
                          {row.petty_cash_limit_irr && (
                            <span className="text-muted tabular-nums">
                              سقف: {amount(row.petty_cash_limit_irr)} ریال
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone={row.active ? "success" : "neutral"}>
                        {row.active ? "فعال" : "غیرفعال"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          variant="ghost"
                          className="h-9 px-2.5 text-xs"
                          onClick={() =>
                            setDrawerState({
                              open: true,
                              editing: row,
                              readOnly: true,
                            })
                          }
                        >
                          <EyeIcon size={15} aria-hidden />
                          مشاهده
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              variant="secondary"
                              className="h-9 px-2.5 text-xs"
                              onClick={() =>
                                setDrawerState({
                                  open: true,
                                  editing: row,
                                  readOnly: false,
                                })
                              }
                            >
                              <PencilSimpleIcon size={15} aria-hidden />
                              ویرایش
                            </Button>
                            <Button
                              variant="ghost"
                              className={
                                row.active
                                  ? "h-9 px-2.5 text-xs text-warning hover:bg-warning-soft/40"
                                  : "h-9 px-2.5 text-xs text-success hover:bg-success-soft/40"
                              }
                              onClick={() => {
                                toggleCommand.clearError();
                                setToggling(row);
                              }}
                            >
                              <PowerIcon size={15} aria-hidden />
                              {row.active ? "غیرفعالسازی" : "فعال‌سازی"}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmptyCell
                  colSpan={6}
                  title={
                    search || kindFilter !== "all" || statusFilter !== "all"
                      ? "حساب خزانه‌ای با این فیلتر یافت نشد"
                      : "هنوز حساب خزانه‌ای تعریف نشده است"
                  }
                />
              )}
            </TableBody>
          </Table>
        )}
      </Panel>

      <TreasuryAccountDrawer
        open={drawerState.open}
        editing={drawerState.editing}
        readOnly={drawerState.readOnly}
        existingLinkedAccountIds={linkedAccountIds}
        onClose={() =>
          setDrawerState({ open: false, editing: null, readOnly: false })
        }
        onSuccess={() => {
          resource.refresh();
        }}
      />

      <ConfirmDialog
        title={toggling?.active ? "حساب خزانه غیرفعال شود؟" : "حساب خزانه فعال شود؟"}
        open={!!toggling}
        onOpenChange={(open) => {
          if (!open) setToggling(null);
        }}
        busy={toggleCommand.busy}
        onConfirm={confirmToggleActive}
      >
        <p className="font-medium text-foreground">{toggling?.name}</p>
        {toggling?.active ? (
          <StatusMessage tone="warning">
            غیرفعالسازی حساب خزانه مانع انتخاب آن در دریافت‌ها و پرداخت‌های جدید می‌شود. حساب متناظر در کدینگ دفتر ({toggling.account_code}) و تمام سوابق دریافت و پرداخت قبلی بدون تغییر باقی می‌مانند.
          </StatusMessage>
        ) : (
          <p className="text-xs text-muted">
            پس از فعال‌سازی، این حساب دوباره در ابزارهای دریافت و پرداخت قابل انتخاب خواهد بود.
          </p>
        )}
        <FormMessage error>{toggleCommand.error?.message}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
