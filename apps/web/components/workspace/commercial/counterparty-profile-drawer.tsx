"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Drawer } from "@/components/ui/drawer";
import { Field } from "@/components/ui/field";
import { DetailField, DetailGroup } from "@/components/ui/field-layout";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { SearchInput } from "@/components/ui/search-input";
import { useCommand } from "@/hooks/use-command";
import { useCounterpartyFinancialSummary } from "@/hooks/use-counterparty-financial-summary";
import { useResource } from "@/hooks/use-resource";
import { useWorkspace } from "@/hooks/workspace";
import type { AccountingCapabilities } from "@/lib/accounting";
import {
  counterpartyEntityKindLabel,
  counterpartyTypeLabel,
  type Counterparty,
  type CounterpartyForm,
} from "@/lib/commercial";
import { amount, displayDate, persian } from "@/lib/utils";
import { CounterpartyEditor, normalizeCounterpartyPayload } from "./counterparty-editor";

const directionLabels = {
  debtor: "بدهکار",
  creditor: "بستانکار",
  settled: "تسویه",
};

export function CounterpartyProfileDrawer({
  party,
  canEdit,
  canViewReports,
  onEdit,
  onClose,
}: {
  party: Counterparty;
  canEdit?: boolean;
  canViewReports?: boolean;
  onEdit?: () => void;
  onClose: () => void;
}) {
  const workspace = useWorkspace();
  const effectiveCanViewReports = canViewReports ?? Boolean(workspace.company?.role);
  const { unit, asOfDate, setAsOfDate, ledger, invoices, sale, purchase } =
    useCounterpartyFinancialSummary(party.id, effectiveCanViewReports);
  const roles = party.roles?.length ? party.roles : [party.type];
  const isNatural = party.entity_kind === "natural_person";

  return (
    <Drawer
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="sm:max-w-2xl"
      title={`پرونده طرف‌حساب: ${party.name}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {effectiveCanViewReports && (
              <>
                <ButtonLink variant="secondary" href={`/receivables?party_id=${encodeURIComponent(party.id)}`}>
                  فاکتورهای فروش
                </ButtonLink>
                <ButtonLink variant="secondary" href={`/payables?party_id=${encodeURIComponent(party.id)}`}>
                  فاکتورهای خرید
                </ButtonLink>
                <ButtonLink
                  variant="secondary"
                  href={`/reconciliation/counterparties?party_id=${encodeURIComponent(party.id)}`}
                >
                  تطبیق این طرف‌حساب
                </ButtonLink>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && onEdit && (
              <Button variant="primary" onClick={onEdit}>
                ویرایش طرف‌حساب
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={party.active ? "success" : "neutral"}>
            {party.active ? "فعال" : "غیرفعال"}
          </Badge>
          <Badge tone="neutral">{counterpartyEntityKindLabel(party.entity_kind)}</Badge>
          {roles.map((r) => (
            <Badge key={r} tone="primary">
              {counterpartyTypeLabel(r)}
            </Badge>
          ))}
        </div>

        <DetailGroup>
          <DetailField label="نام" value={party.name} />
          <DetailField label="کد داخلی" value={<bdi dir="ltr">{party.code}</bdi>} />
          <DetailField
            label={isNatural ? "کد ملی" : "شناسه ملی"}
            value={<bdi dir="ltr">{party.national_id || "—"}</bdi>}
          />
          <DetailField
            label="سقف اعتبار (ریال)"
            value={party.credit_limit_irr === null ? "بدون سقف" : `${amount(party.credit_limit_irr)} ریال`}
          />
          {(!isNatural || party.registration_number) && (
            <DetailField label="شماره ثبت" value={<bdi dir="ltr">{party.registration_number || "—"}</bdi>} />
          )}
          <DetailField label="کد اقتصادی" value={<bdi dir="ltr">{party.economic_code || "—"}</bdi>} />
          <DetailField label="تلفن" value={<bdi dir="ltr">{party.phone || "—"}</bdi>} />
          <DetailField label="ایمیل" value={<bdi dir="ltr">{party.email || "—"}</bdi>} />
          <DetailField label="کد پستی" value={<bdi dir="ltr">{party.postal_code || "—"}</bdi>} />
          <DetailField label="نشانی" value={party.address || "—"} />
        </DetailGroup>

        <div className="space-y-4 rounded-panel border border-border bg-canvas/40 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">وضعیت مانده به تفکیک مبنا</h3>
              <p className="mt-0.5 text-xs text-muted">
                ماندهٔ دفتر بومی و ماندهٔ فاکتورها تا تاریخ گزارش.
              </p>
            </div>
            <div className="w-48">
              <Field id="profile-as-of" label="تاریخ گزارش">
                <PersianDatePicker
                  id="profile-as-of"
                  value={asOfDate}
                  onChange={setAsOfDate}
                />
              </Field>
            </div>
          </div>

          {!effectiveCanViewReports ? (
            <StatusMessage tone="primary">
              مشاهدهٔ مانده‌های مالی و پیوندهای گزارش نیازمند مجوز مشاهدهٔ گزارش‌های شرکت است.
            </StatusMessage>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 rounded-control border border-border bg-surface p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">مبنای دفتر بومی</span>
                  <span className="text-xs text-muted">تا {displayDate(asOfDate)}</span>
                </div>
                {ledger.loading ? (
                  <LoadingState label="در حال محاسبهٔ مانده دفتر..." />
                ) : ledger.error ? (
                  <ErrorState message={ledger.error.message} onRetry={ledger.refresh} />
                ) : ledger.data && ledger.data.totals.entry_count > 0 ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">گردش بدهکار:</span>
                      <span className="tabular-nums">{amount(ledger.data.totals.debit_total, unit)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted">گردش بستانکار:</span>
                      <span className="tabular-nums">{amount(ledger.data.totals.credit_total, unit)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/60 pt-1.5 font-medium">
                      <span>مانده دفتر ({directionLabels[ledger.data.totals.direction]}):</span>
                      <span className="tabular-nums">{amount(ledger.data.totals.net_balance, unit)}</span>
                    </div>
                    <div className="text-xs text-muted">
                      تعداد ردیف دفتر: {persian(ledger.data.totals.entry_count)}
                    </div>
                  </div>
                ) : <p className="text-sm text-muted">گردش دفتر بومی در این تاریخ موجود نیست.</p>}
              </div>

              <div className="space-y-2 rounded-control border border-border bg-surface p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">مبنای فاکتورها</span>
                  <span className="text-xs text-muted">تا {displayDate(asOfDate)}</span>
                </div>
                {invoices.loading ? (
                  <LoadingState label="در حال محاسبهٔ مانده فاکتورها..." />
                ) : invoices.error ? (
                  <ErrorState message={invoices.error.message} onRetry={invoices.refresh} />
                ) : (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">مانده فاکتورهای فروش ({persian(sale.count)}):</span>
                      <span className="tabular-nums">
                        {amount(sale.remaining, unit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted">مانده فاکتورهای خرید ({persian(purchase.count)}):</span>
                      <span className="tabular-nums">
                        {amount(purchase.remaining, unit)}
                      </span>
                    </div>
                    {(sale.unknownCount > 0 || purchase.unknownCount > 0) && (
                      <div className="text-xs text-warning">
                        {persian(sale.unknownCount + purchase.unknownCount)} فاکتور با ماندهٔ نامشخص مانع محاسبهٔ جمع است.
                      </div>
                    )}
                    <div className="border-t border-border/60 pt-1.5 text-xs text-muted">
                      شامل فاکتورهای ثبت‌شده در دفتر بومی تا تاریخ {displayDate(asOfDate)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

export function CounterpartyQuickDrawer({
  open,
  onOpenChange,
  initialMode = "list",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "list" | "create";
  onCreated?: (created: Counterparty) => void;
}) {
  const workspace = useWorkspace();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"list" | "create">(initialMode);
  const [viewing, setViewing] = useState<Counterparty | null>(null);
  const command = useCommand();

  const capabilities = useResource<AccountingCapabilities>(
    open ? workspace.companyPath("accounting/capabilities") : null,
  );
  const list = useResource<{ items: Counterparty[]; total: number }>(
    open && mode === "list"
      ? workspace.companyPath(
          `commercial/counterparties?limit=20${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`,
        )
      : null,
  );

  if (!open) return null;

  const canEdit = capabilities.data?.can_manage_accounts === true;
  const canViewReports = Boolean(workspace.company?.role);

  if (viewing) {
    return (
      <CounterpartyProfileDrawer
        party={viewing}
        canEdit={canEdit}
        canViewReports={canViewReports}
        onClose={() => setViewing(null)}
      />
    );
  }

  if (mode === "create") {
    return (
      <CounterpartyEditor
        readOnly={false}
        busy={command.busy}
        error={command.error?.message}
        onClose={() => {
          if (initialMode === "create") {
            onOpenChange(false);
          } else {
            setMode("list");
          }
        }}
        onSave={(form: CounterpartyForm) => {
          const body = normalizeCounterpartyPayload(form);
          if (!body.roles.length) return;
          void command.run<Counterparty>(
            workspace.companyPath("commercial/counterparties"),
            { method: "POST", body },
            (created) => {
              onCreated?.(created);
              if (initialMode === "create") {
                onOpenChange(false);
              } else {
                setMode("list");
                list.refresh();
              }
            },
            "طرف‌حساب جدید ثبت شد",
          );
        }}
      />
    );
  }

  return (
    <Drawer
      open
      onOpenChange={onOpenChange}
      title="دسترسی سریع طرف‌حساب‌ها"
      className="sm:max-w-xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ButtonLink variant="ghost" href="/commercial/counterparties">
            مدیریت کامل در تعاریف مالی
          </ButtonLink>
          {canEdit && (
            <Button onClick={() => { command.clearError(); setMode("create"); }}>
              طرف‌حساب جدید
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <SearchInput
          label="جست‌وجوی نام یا کد طرف‌حساب"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {list.loading ? (
          <LoadingState label="در حال بارگذاری طرف‌حساب‌ها" />
        ) : list.error ? (
          <ErrorState message={list.error.message} onRetry={list.refresh} />
        ) : !(list.data?.items?.length) ? (
          <StatusMessage tone="primary">طرف‌حسابی با این مشخصات پیدا نشد.</StatusMessage>
        ) : (
          <div className="space-y-2">
            {list.data.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border/80 bg-surface p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-foreground">{item.name}</span>
                    <Badge tone="neutral"><bdi>{item.code}</bdi></Badge>
                    <Badge tone={item.active ? "success" : "neutral"}>
                      {item.active ? "فعال" : "غیرفعال"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {counterpartyEntityKindLabel(item.entity_kind)} ·{" "}
                    {(item.roles?.length ? item.roles : [item.type])
                      .map((r) => counterpartyTypeLabel(r))
                      .join("، ")}
                  </div>
                </div>
                <Button variant="secondary" onClick={() => setViewing(item)}>
                  مشاهده پرونده
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
