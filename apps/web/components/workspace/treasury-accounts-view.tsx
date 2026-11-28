"use client";

import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { useState } from "react";
import {
  BankIcon,
  CreditCardIcon,
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
import { FormMessage } from "@/components/ui/field";
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
import { useTreasuryAccounts } from "@/hooks/use-treasury-account-management";
import { useWorkspace } from "@/hooks/workspace";
import { treasuryKindLabels, type TreasuryAccountItem } from "@/lib/treasury-documents";
import { amount } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";
import { TreasuryAccountDrawer } from "./treasury-account-drawer";

const icons = { bank: BankIcon, cash: WalletIcon, petty_cash: WalletIcon, pos: CreditCardIcon };

function maskIdentifier(value?: string | null): string {
  if (!value) return "—";
  if (value.length <= 6) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function TreasuryAccountSummary({ account }: { account: TreasuryAccountItem }) {
  if (account.kind === "bank") {
    return (
      <div className="flex flex-col gap-0.5">
        {account.bank_name && <span>{account.bank_name}</span>}
        <bdi className="tabular-nums">{maskIdentifier(account.account_number || account.iban)}</bdi>
      </div>
    );
  }
  if (account.kind === "pos") return account.linked_bank_name || "—";
  if (account.kind === "petty_cash") {
    return (
      <div className="flex flex-col gap-0.5">
        <span>{account.custodian_name || "—"}</span>
        {account.petty_cash_limit_irr && (
          <span className="text-xs text-muted tabular-nums">{amount(account.petty_cash_limit_irr)} ریال</span>
        )}
      </div>
    );
  }
  return "—";
}

export function TreasuryAccountsView() {
  const workspace = useWorkspace();
  return workspace.company ? <TreasuryWorkspace key={workspace.company.id} /> : <NoCompany />;
}

function TreasuryWorkspace() {
  const {
    capabilities, canView, canCreate, canEdit, resource, toggling, setToggling, toggleCommand, confirmToggleActive,
  } = useTreasuryAccounts();
  const [drawer, setDrawer] = useState<{ account: TreasuryAccountItem | null; readOnly: boolean } | null>(null);
  const items = resource.data?.items ?? [];
  const editingBank = drawer?.account?.linked_bank_id;
  const bankOptions = items
    .filter((item) => item.kind === "bank" && (
      (item.active && item.account_active !== false) || item.id === editingBank
    ))
    .map((item) => ({ value: item.id, label: item.name }));

  return (
    <>
      <PageHeader
        title="حساب‌های خزانه"
        icon={BankIcon}
        action={canCreate && (
          <Button onClick={() => setDrawer({ account: null, readOnly: false })}>
            <PlusIcon size={18} aria-hidden />
            تعریف حساب خزانه
          </Button>
        )}
      />
      {capabilities.loading || resource.loading ? (
        <LoadingState label="در حال دریافت حساب‌های خزانه" variant="table" />
      ) : capabilities.error ? (
        <ErrorState message={capabilities.error.message} onRetry={capabilities.refresh} />
      ) : !canView ? (
        <StatusMessage>دسترسی مشاهدهٔ حساب‌های خزانه ندارید.</StatusMessage>
      ) : resource.error ? (
        <ErrorState message={resource.error.message} onRetry={resource.refresh} />
      ) : (
        <Panel>
          <Table title="حساب‌های خزانه">
            <TableHeader>
              <TableRow>
                <TableHead>نام</TableHead>
                <TableHead>نوع</TableHead>
                <TableHead>کد حساب</TableHead>
                <TableHead>مشخصات</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((account) => {
                const Icon = icons[account.kind];
                return (
                  <TableRow key={account.id}>
                    <TableRowHeader>
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="shrink-0 text-primary" aria-hidden />
                        <span>{account.name}</span>
                        {account.needs_completion && <Badge tone="warning">نیازمند تکمیل</Badge>}
                      </div>
                    </TableRowHeader>
                    <TableCell>{treasuryKindLabels[account.kind]}</TableCell>
                    <TableCell><bdi className="tabular-nums">{account.code || "—"}</bdi></TableCell>
                    <TableCell><TreasuryAccountSummary account={account} /></TableCell>
                    <TableCell>
                      <Badge tone={account.active ? "success" : "neutral"}>
                        {account.active ? "فعال" : "غیرفعال"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TableRowActions label={`عملیات ${account.name}`}>
                        <TableRowAction
                          onClick={() => setDrawer({ account, readOnly: true })}
                          icon={<EyeIcon size={15} aria-hidden />}
                        >
                          مشاهده
                        </TableRowAction>
                        {canEdit && (
                          <>
                            <TableRowAction
                              onClick={() => setDrawer({ account, readOnly: false })}
                              icon={<PencilSimpleIcon size={15} aria-hidden />}
                            >
                              ویرایش
                            </TableRowAction>
                            <TableRowAction
                              onClick={() => { toggleCommand.clearError(); setToggling(account); }}
                              icon={<PowerIcon size={15} aria-hidden />}
                            >
                              {account.active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                            </TableRowAction>
                          </>
                        )}
                      </TableRowActions>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!items.length && <TableEmptyCell colSpan={6} title="حساب خزانه‌ای تعریف نشده است" />}
            </TableBody>
          </Table>
        </Panel>
      )}

      {drawer && (
        <TreasuryAccountDrawer
          editing={drawer.account}
          readOnly={drawer.readOnly}
          bankOptions={bankOptions}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); resource.refresh(); }}
        />
      )}
      <ConfirmDialog
        title={toggling?.active ? "حساب خزانه غیرفعال شود؟" : "حساب خزانه فعال شود؟"}
        open={Boolean(toggling)}
        onOpenChange={(open) => { if (!open) setToggling(null); }}
        busy={toggleCommand.busy}
        onConfirm={confirmToggleActive}
      >
        <p>{toggling?.name}</p>
        <FormMessage error>{toggleCommand.error?.message}</FormMessage>
      </ConfirmDialog>
    </>
  );
}
