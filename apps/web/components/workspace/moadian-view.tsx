"use client";

import { useMemo, useState } from "react";
import {
  PlusIcon,
  ReceiptIcon as HeaderIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColumnFilteredTable, type ListColumn } from "@/components/ui/column-filtered-table";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SingleFilePicker } from "@/components/ui/single-file-picker";
import { TableCell, TableRow, TableRowHeader } from "@/components/ui/table";
import { TableRowAction, TableRowActions } from "@/components/ui/table-row-actions";
import { useFinancialView } from "@/hooks/use-financial-view";
import { useMoadianImport } from "@/hooks/use-moadian-import";
import { useMoadianReconciliation, type MoadianInvoiceItem } from "@/hooks/use-moadian-reconciliation";
import { useMoadianTransmissions } from "@/hooks/use-moadian-transmissions";
import { moadianStatus, type MoadianTransmission } from "@/lib/moadian-transmissions";
import { amount, displayDate, persian } from "@/lib/utils";
import { MoadianTransmissionForm } from "./moadian-transmission-form";
import { NoCompany, PageHeader, Panel } from "./page-parts";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "primary";

interface PortalRow {
  invoice_id?: string | null;
  reference?: string | null;
  internal_reference?: string | null;
  tax_id?: string | null;
  date?: string | null;
  portal?: string | null;
  portal_amount?: string | null;
  tax?: string | null;
  status?: string | null;
  state?: string | null;
  party?: string | null;
}

interface UnifiedMoadianRow {
  key: string;
  direction: "sales" | "purchases";
  directionLabel: string;
  reference: string;
  internalReference?: string;
  invoiceId?: string;
  party: string;
  date?: string | null;
  taxId?: string | null;
  referenceNumber?: string | null;
  uid?: string | null;
  bookAmount?: string | null;
  portalAmount?: string | null;
  difference?: string | null;
  statusLabel: string;
  statusTone: BadgeTone;
  errorCodes: string[];
  transmission?: MoadianTransmission;
  canSendRow: boolean;
}

const comparisonLabels: Record<string, { label: string; tone: BadgeTone }> = {
  matched: { label: "منطبق", tone: "success" },
  needs_review: { label: "نیازمند بررسی", tone: "warning" },
  portal_only: { label: "فقط در کارپوشه", tone: "neutral" },
  internal_only: { label: "فقط در دیدبان", tone: "neutral" },
  amount_mismatch: { label: "اختلاف مبلغ", tone: "warning" },
  tax_mismatch: { label: "اختلاف مالیات", tone: "warning" },
  date_mismatch: { label: "اختلاف تاریخ", tone: "warning" },
  party_mismatch: { label: "اختلاف طرف‌حساب", tone: "warning" },
};

const reconciliationTones: Record<string, BadgeTone> = {
  accepted: "success",
  pending: "warning",
  rejected: "danger",
  untransmitted: "neutral",
};

export function MoadianView() {
  const view = useFinancialView("moadian");
  if (!view.workspace.company) return <NoCompany />;
  return (
    <MoadianContent
      key={`${view.workspace.user?.id}:${view.workspace.company.id}:${view.workspace.periodId}`}
      view={view}
    />
  );
}

function MoadianContent({ view }: { view: ReturnType<typeof useFinancialView> }) {
  const transmissions = useMoadianTransmissions();
  const reconciliation = useMoadianReconciliation();
  const importSource = useMoadianImport(view.manifest?.id);

  const [importOpen, setImportOpen] = useState(false);
  const [importDirection, setImportDirection] = useState<"sales" | "purchases">("sales");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const unit = view.workspace.unit;
  const unitName = unit === "IRR" ? "ریال" : "تومان";
  const canSend = !!transmissions.canSend;
  const canImport = !!(view.workspace.canWrite && view.workspace.periodId);

  const transmissionItems = transmissions.resource.data?.items;
  const portal = view.manifest?.details.moadian;
  const rows = useMemo<UnifiedMoadianRow[]>(() => {
    const transmissionRows = transmissionItems ?? [];
    const portalSales = (portal?.sales ?? []) as PortalRow[];
    const portalPurchases = (portal?.purchases ?? []) as PortalRow[];
    const transByInvoiceId = new Map<string, MoadianTransmission>();
    const transByRef = new Map<string, MoadianTransmission>();
    for (const t of transmissionRows) {
      if (t.invoice_id && !transByInvoiceId.has(t.invoice_id)) {
        transByInvoiceId.set(t.invoice_id, t);
      }
      if (t.invoice_reference && !transByRef.has(t.invoice_reference)) {
        transByRef.set(t.invoice_reference, t);
      }
    }

    const portalSalesByRef = new Map<string, PortalRow>();
    const portalSalesByTaxId = new Map<string, PortalRow>();
    for (const p of portalSales) {
      const ref = p.internal_reference || p.reference;
      if (ref) portalSalesByRef.set(ref, p);
      if (p.tax_id) portalSalesByTaxId.set(p.tax_id, p);
    }

    const merged: UnifiedMoadianRow[] = [];
    const seenInvoiceIds = new Set<string>();
    const seenRefs = new Set<string>();
    const seenTaxIds = new Set<string>();

    const addReconciliationGroup = (
      items: MoadianInvoiceItem[],
      groupKey: "untransmitted" | "rejected" | "accepted" | "pending",
    ) => {
      for (const item of items) {
        const trans =
          transByInvoiceId.get(item.invoice_id) ||
          transByRef.get(item.reference);
        const portal =
          (item.tax_id && portalSalesByTaxId.get(item.tax_id)) ||
          portalSalesByRef.get(item.reference);

        if (item.invoice_id) seenInvoiceIds.add(item.invoice_id);
        if (item.reference) seenRefs.add(item.reference);
        if (item.tax_id || trans?.tax_id) seenTaxIds.add((item.tax_id || trans?.tax_id)!);

        const tStatus = trans ? moadianStatus(trans.status) : null;
        merged.push({
          key: `inv:${item.invoice_id}`,
          direction: "sales",
          directionLabel: "فروش",
          reference: item.reference,
          internalReference: item.reference,
          invoiceId: item.invoice_id,
          party: item.party_id || portal?.party || "—",
          date: item.date || portal?.date,
          taxId: item.tax_id || trans?.tax_id || portal?.tax_id,
          referenceNumber: trans?.reference_number,
          uid: trans?.uid,
          bookAmount: item.amount,
          portalAmount: item.submitted_amount ?? portal?.portal_amount ?? portal?.portal ?? null,
          difference: item.difference,
          statusLabel: item.status_label || tStatus?.label || "نامشخص",
          statusTone: reconciliationTones[groupKey] ?? tStatus?.tone ?? "neutral",
          errorCodes: trans?.error_codes ?? [],
          transmission: trans,
          canSendRow: canSend && (groupKey === "untransmitted" || groupKey === "rejected") && !trans?.can_retry,
        });
      }
    };

    addReconciliationGroup(reconciliation.untransmitted, "untransmitted");
    addReconciliationGroup(reconciliation.rejected, "rejected");
    addReconciliationGroup(reconciliation.accepted, "accepted");
    addReconciliationGroup(reconciliation.pending, "pending");

    for (const t of transmissionRows) {
      if (
        (t.invoice_id && seenInvoiceIds.has(t.invoice_id)) ||
        (t.invoice_reference && seenRefs.has(t.invoice_reference))
      ) {
        continue;
      }
      if (t.invoice_reference) seenRefs.add(t.invoice_reference);
      if (t.tax_id) seenTaxIds.add(t.tax_id);
      const tStatus = moadianStatus(t.status);
      merged.push({
        key: `trans:${t.id}`,
        direction: "sales",
        directionLabel: "فروش",
        reference: t.invoice_reference,
        internalReference: t.invoice_reference,
        invoiceId: t.invoice_id,
        party: "—",
        taxId: t.tax_id,
        referenceNumber: t.reference_number,
        uid: t.uid,
        statusLabel: tStatus.label,
        statusTone: tStatus.tone,
        errorCodes: t.error_codes ?? [],
        transmission: t,
        canSendRow: false,
      });
    }

    portalSales.forEach((p, index) => {
      const ref = p.internal_reference || p.reference || "";
      if ((ref && seenRefs.has(ref)) || (p.tax_id && seenTaxIds.has(p.tax_id))) {
        return;
      }
      const stateKey = p.status || p.state || "";
      const mapped = comparisonLabels[stateKey];
      merged.push({
        key: `ps:${p.tax_id ?? ref}:${index}`,
        direction: "sales",
        directionLabel: "فروش کارپوشه",
        reference: p.reference || p.invoice_id || "—",
        internalReference: p.internal_reference || undefined,
        party: p.party || "—",
        date: p.date,
        taxId: p.tax_id,
        portalAmount: p.portal_amount ?? p.portal,
        statusLabel: mapped?.label ?? "ثبت‌شده در کارپوشه",
        statusTone: mapped?.tone ?? "neutral",
        errorCodes: [],
        canSendRow: false,
      });
    });

    portalPurchases.forEach((p, index) => {
      const stateKey = p.status || p.state || "";
      const mapped = comparisonLabels[stateKey];
      merged.push({
        key: `pp:${p.tax_id ?? p.reference ?? "row"}:${index}`,
        direction: "purchases",
        directionLabel: "خرید کارپوشه",
        reference: p.reference || p.invoice_id || "—",
        internalReference: p.internal_reference || undefined,
        party: p.party || "—",
        date: p.date,
        taxId: p.tax_id,
        portalAmount: p.portal_amount ?? p.portal,
        statusLabel: mapped?.label ?? "ثبت‌شده در کارپوشه",
        statusTone: mapped?.tone ?? "neutral",
        errorCodes: [],
        canSendRow: false,
      });
    });

    return merged;
  }, [
    canSend,
    portal,
    reconciliation.accepted,
    reconciliation.pending,
    reconciliation.rejected,
    reconciliation.untransmitted,
    transmissionItems,
  ]);

  async function handleFileUpload(file: File) {
    setImportBusy(true);
    setImportError(null);
    try {
      await importSource({ file, headers: [], rows: [["_"]], totalRows: 1 }, importDirection);
      setImportOpen(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "بارگذاری فایل ناموفق بود.");
    } finally {
      setImportBusy(false);
    }
  }

  const columns: ListColumn<UnifiedMoadianRow>[] = [
    { label: "شماره / تاریخ", value: (row) => `${row.reference} ${row.date ? displayDate(row.date) : ""}` },
    { label: "جهت", value: (row) => row.directionLabel },
    { label: "طرف‌حساب", value: (row) => row.party },
    { label: "شناسه مالیاتی / پیگیری", value: (row) => `${row.taxId || ""} ${row.referenceNumber || ""}` },
    { label: `مبلغ دفتر (${unitName})`, numeric: true, value: (row) => row.bookAmount ? amount(row.bookAmount, unit) : "—" },
    { label: `مبلغ کارپوشه (${unitName})`, numeric: true, value: (row) => row.portalAmount ? amount(row.portalAmount, unit) : "—" },
    { label: "وضعیت", value: (row) => row.statusLabel },
    { label: "عملیات", srOnly: true },
  ];

  const summary = reconciliation.summary;
  const loading = view.loading || reconciliation.loading || transmissions.resource.loading;
  const primaryError = view.error || reconciliation.error || transmissions.resource.error;
  const transConfigured = transmissions.resource.data?.configured ?? reconciliation.configured;

  return (
    <>
      <PageHeader
        icon={HeaderIcon}
        title="سامانه مؤدیان"
        action={canSend && (
          <Button onClick={() => transmissions.show()} disabled={transmissions.rowCommand.busy}>
            <PlusIcon size={18} aria-hidden />
            آماده‌سازی و ارسال
          </Button>
        )}
      />

      {loading ? (
        <LoadingState label="در حال دریافت اطلاعات سامانه مؤدیان..." variant="table" />
      ) : primaryError && !rows.length ? (
        <ErrorState message={primaryError.message} />
      ) : (
        <div className="space-y-6">
          {summary && summary.invoices_count > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-xl border border-border/80 bg-surface p-4 shadow-xs">
                <p className="text-xs text-muted">فروش کل طبق دفاتر</p>
                <p className="mt-1 font-semibold text-lg tabular-nums">{amount(summary.total_sales_book, unit)}</p>
                <p className="text-xs text-muted">{persian(summary.invoices_count)} فاکتور فروش</p>
              </div>
              <div className="rounded-xl border border-border/80 bg-surface p-4 shadow-xs">
                <p className="text-xs text-muted">تأییدشده در کارپوشه</p>
                <p className="mt-1 font-semibold text-lg tabular-nums text-emerald-600">{amount(summary.total_sales_accepted, unit)}</p>
                <p className="text-xs text-muted">{persian(summary.accepted_count)} فاکتور موفق</p>
              </div>
              <div className="rounded-xl border border-border/80 bg-surface p-4 shadow-xs">
                <p className="text-xs text-muted">فروش ارسال‌نشده</p>
                <p className={`mt-1 font-semibold text-lg tabular-nums ${summary.untransmitted_count > 0 ? "text-rose-600" : "text-muted"}`}>
                  {amount(summary.total_sales_untransmitted, unit)}
                </p>
                <p className="text-xs text-muted">{persian(summary.untransmitted_count)} فاکتور معلق</p>
              </div>
              <div className="rounded-xl border border-border/80 bg-surface p-4 shadow-xs">
                <p className="text-xs text-muted">مغایرت ارزش افزوده</p>
                <p className={`mt-1 font-semibold text-lg tabular-nums ${summary.vat_discrepancy !== "0" ? "text-amber-600" : "text-emerald-600"}`}>
                  {amount(reconciliation.hasPortalEvidence ? summary.vat_discrepancy : null, unit)}
                </p>
              </div>
              <div className="rounded-xl border border-border/80 bg-surface p-4 shadow-xs">
                <p className="text-xs text-muted">پوشش پذیرش</p>
                <p className="mt-1 font-semibold text-lg tabular-nums">
                  {!reconciliation.hasPortalEvidence || summary.compliance_percentage == null
                    ? "—"
                    : `${persian(summary.compliance_percentage)}٪`}
                </p>
              </div>
            </div>
          )}

          <Panel className="space-y-4">
            {!transConfigured && (
              <StatusMessage tone="warning">
                اتصال سامانه مؤدیان برای این شرکت تنظیم نشده است (ارسال مستقیم غیرفعال است).
              </StatusMessage>
            )}
            {summary && summary.untransmitted_count > 0 && (
              <StatusMessage tone="warning">
                <WarningCircleIcon size={18} aria-hidden />
                {persian(summary.untransmitted_count)} فاکتور فروش نهایی به سامانه مؤدیان ارسال نشده است.
              </StatusMessage>
            )}
            {!view.workspace.periodId && (
              <StatusMessage tone="warning">
                برای ورود اکسل کارپوشه، ابتدا دورهٔ مالی را از هدر انتخاب کنید.
              </StatusMessage>
            )}
            {!transmissions.retryTarget && <FormMessage error>{transmissions.rowCommand.error?.message}</FormMessage>}

            <ColumnFilteredTable
              label="فهرست یکپارچه صورتحساب‌های مؤدیان"
              columns={columns}
              onOpenImport={canImport ? () => { setImportError(null); setImportOpen(true); } : undefined}
              rows={rows}
              emptyTitle="هنوز صورتحساب یا سابقهٔ مؤدیانی ثبت نشده است"
              renderRow={(row) => {
                const needsInquiry = !!(
                  row.transmission &&
                  (row.transmission.can_inquire || ["unknown", "sent"].includes(row.transmission.status))
                );
                const canRetry = !!row.transmission?.can_retry;
                const hasActions = row.canSendRow || needsInquiry || canRetry || !!row.internalReference;

                return (
                  <TableRow key={row.key}>
                    <TableRowHeader>
                      <div><bdi>{row.reference}</bdi></div>
                      {row.date && <div className="text-xs text-muted">{displayDate(row.date)}</div>}
                    </TableRowHeader>
                    <TableCell className="text-xs">{row.directionLabel}</TableCell>
                    <TableCell className="text-xs">{row.party}</TableCell>
                    <TableCell className="text-xs">
                      <div><bdi className="break-all">{row.taxId || "—"}</bdi></div>
                      {row.referenceNumber && (
                        <div className="mt-1 text-muted">پیگیری: <bdi className="break-all">{row.referenceNumber}</bdi></div>
                      )}
                    </TableCell>
                    <TableCell numeric className="whitespace-nowrap">
                      {row.bookAmount ? amount(row.bookAmount, unit) : "—"}
                    </TableCell>
                    <TableCell numeric className="whitespace-nowrap">
                      <div>{row.portalAmount ? amount(row.portalAmount, unit) : "—"}</div>
                      {row.difference && row.difference !== "0" && (
                        <div className="text-xs text-amber-600">اختلاف: {amount(row.difference, unit)}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                      {!!row.errorCodes.length && (
                        <p className="mt-1 text-xs text-muted">
                          کد خطا <bdi>{row.errorCodes.join("، ")}</bdi>
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {hasActions ? (
                        <TableRowActions label={`عملیات ${row.reference}`}>
                          {row.canSendRow && row.invoiceId && (
                            <TableRowAction onClick={() => transmissions.show(row.invoiceId)}>
                              ارسال به مؤدیان
                            </TableRowAction>
                          )}
                          {needsInquiry && row.transmission && (
                            <TableRowAction
                              disabled={transmissions.rowCommand.busy}
                              busy={transmissions.rowAction?.kind === "inquiry" && transmissions.rowAction.id === row.transmission.id}
                              onClick={() => transmissions.inquire(row.transmission!)}
                            >
                              استعلام وضعیت
                            </TableRowAction>
                          )}
                          {canRetry && row.transmission && (
                            <TableRowAction
                              disabled={transmissions.rowCommand.busy}
                              onClick={() => transmissions.confirmRetry(row.transmission!)}
                            >
                              ارسال دوباره
                            </TableRowAction>
                          )}
                          {row.internalReference && (
                            <TableRowAction
                              href={`${row.direction === "sales" ? "/receivables" : "/payables"}?tab=imported&reference=${encodeURIComponent(row.internalReference)}`}
                            >
                              مشاهده در فاکتورها
                            </TableRowAction>
                          )}
                        </TableRowActions>
                      ) : "—"}
                    </TableCell>
                  </TableRow>
                );
              }}
            />
          </Panel>
        </div>
      )}

      <MoadianTransmissionForm view={transmissions} />

      <Dialog
        title="ارسال دوباره به مؤدیان"
        open={!!transmissions.retryTarget}
        onOpenChange={(open) => {
          if (!open) transmissions.confirmRetry();
        }}
        footer={
          <Button busy={transmissions.rowCommand.busy} onClick={transmissions.retry}>
            تأیید ارسال دوباره
          </Button>
        }
      >
        {transmissions.retryTarget && (
          <p className="text-sm">
            صورتحساب فاکتور <bdi>{transmissions.retryTarget.invoice_reference}</bdi> با همان شناسه دوباره ارسال می‌شود.
          </p>
        )}
        <FormMessage error>{transmissions.rowCommand.error?.message}</FormMessage>
      </Dialog>

      <Dialog
        title="ورود اکسل کارپوشه مؤدیان"
        open={importOpen}
        onOpenChange={(open) => { if (!importBusy) setImportOpen(open); }}
      >
        <div className="space-y-4">
          <Field id="moadian-import-direction" label="نوع صورتحساب کارپوشه">
            <Select
              id="moadian-import-direction"
              value={importDirection}
              disabled={importBusy}
              onValueChange={(value) => setImportDirection(value as "sales" | "purchases")}
              options={[
                { value: "sales", label: "صورتحساب‌های فروش کارپوشه" },
                { value: "purchases", label: "صورتحساب‌های خرید کارپوشه" },
              ]}
            />
          </Field>
          <SingleFilePicker
            accept=".xlsx,.xls,.csv"
            label="انتخاب فایل اکسل / CSV"
            busy={importBusy}
            onFile={(file) => void handleFileUpload(file)}
          />
          <FormMessage error>{importError}</FormMessage>
        </div>
      </Dialog>
    </>
  );
}
