"use client";
import { useState } from "react";
import { AccountEditor } from "./account-editor";
import { AccountFilters } from "./account-filters";
import {
  accountLevelLabel,
  accountRoleLabel,
  treasuryRoleLabel,
} from "@/lib/account-catalogue";
import { BankIcon, BooksIcon, PlusIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { CursorPagination } from "@/components/ui/pagination";
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
import { TreasuryAccountDrawer } from "./treasury-account-drawer";
import { useLedgerAccounts } from "@/hooks/use-accounting";
import { useWorkspace } from "@/hooks/workspace";
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
  const [treasuryOpen, setTreasuryOpen] = useState(false);
  const editable = !!view.capabilities.data?.can_manage_accounts;
  const error = view.resource.error || view.capabilities.error;
  return (
    <>
      <PageHeader
        title="کدینگ حساب‌ها"
        icon={BooksIcon}
        action={
          editable && (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setTreasuryOpen(true)}
              >
                <BankIcon size={18} aria-hidden />
                تعریف بانک / صندوق / تنخواه
              </Button>
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
            </div>
          )
        }
      />
      <Panel>
        <AccountFilters view={view} />
        {view.resource.loading || view.capabilities.loading ? (
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
            <Table title="کدینگ حساب‌ها" onImport={view.importFromExcel}>
              <TableHeader>
                <TableRow>
                  <TableHead>کد حساب</TableHead>
                  <TableHead>نام حساب</TableHead>
                  <TableHead>نقش حساب</TableHead>
                  <TableHead>سطح حساب</TableHead>
                  <TableHead>حساب بالادست</TableHead>
                  <TableHead>ماهیت حساب</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>
                    <span className="sr-only">عملیات</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.rows.length ? (
                  view.rows.map((account) => (
                    <TableRow key={account.id}>
                      <TableRowHeader>
                        <span dir="ltr" className="inline-block font-mono">
                          {account.code}
                        </span>
                      </TableRowHeader>
                      <TableCell>{account.name}</TableCell>
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
                      <TableCell><Badge tone="neutral">{accountLevelLabel(account.level)}</Badge></TableCell>
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
                        <Badge tone={account.active ? "success" : "neutral"}>
                          {account.active ? "فعال" : "غیرفعال"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {
                          <Button
                            variant="secondary"
                            onClick={() => view.open(account)}
                          >
                            {editable ? "ویرایش" : "مشاهده"}
                          </Button>
                        }
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableEmptyCell colSpan={8} title={view.filtersActive ? "حسابی برای این فیلترها پیدا نشد" : "هنوز حسابی تعریف نشده است"} />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...view.resource} />
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
        <TreasuryAccountDrawer
          open={treasuryOpen}
          onClose={() => setTreasuryOpen(false)}
          onSuccess={() => {
            view.refresh();
          }}
        />
      )}
      {editable && (
        <Drawer
          title="الگو و ورود کدینگ حساب‌ها"
          open={importOpen}
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
