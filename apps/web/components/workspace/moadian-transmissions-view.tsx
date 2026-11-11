"use client";

import { ArrowClockwiseIcon, PlusIcon, ReceiptIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { Dialog } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
import { CursorPagination } from "@/components/ui/pagination";
import { useMoadianTransmissions } from "@/hooks/use-moadian-transmissions";
import { useWorkspace } from "@/hooks/workspace";
import { MoadianTransmissionForm } from "./moadian-transmission-form";
import { MoadianTransmissionTable } from "./moadian-transmission-table";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function MoadianTransmissionsView() {
  const { company, user } = useWorkspace();
  return company ? <TransmissionWorkspace key={user?.id + ":" + company.id} /> : <NoCompany />;
}

function TransmissionWorkspace() {
  const view = useMoadianTransmissions();
  const data = view.resource.data;
  return (
    <>
      <PageHeader
        title="ارسال و استعلام صورتحساب"
        icon={ReceiptIcon}
        action={<ButtonLink href="/moadian" variant="secondary">مقایسه فایل‌های مؤدیان</ButtonLink>}
      />
      {view.resource.loading ? (
        <LoadingState variant="panels" label="در حال دریافت وضعیت ارسال صورتحساب‌ها" />
      ) : view.resource.error ? (
        <ErrorState message={view.resource.error.message} onRetry={view.refreshHistory} />
      ) : data && (
        <Panel
          title="سوابق ارسال"
          className="space-y-4"
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={view.refreshHistory} disabled={view.rowCommand.busy}>
                <ArrowClockwiseIcon size={18} aria-hidden />
                تازه‌سازی
              </Button>
              {data.configured && data.can_submit && (
                <Button onClick={view.show} disabled={view.rowCommand.busy}>
                  <PlusIcon size={18} aria-hidden />
                  آماده‌سازی صورتحساب
                </Button>
              )}
            </div>
          }
        >
          {!data.configured && (
            <StatusMessage>اتصال مؤدیان برای این شرکت تنظیم نشده است.</StatusMessage>
          )}
          {!view.retryTarget && <FormMessage error>{view.rowCommand.error?.message}</FormMessage>}
          <MoadianTransmissionTable
            rows={view.rows}
            busy={view.rowCommand.busy}
            inquiring={view.rowAction?.kind === "inquiry" ? view.rowAction.id : undefined}
            onInquire={view.inquire}
            onRetry={view.confirmRetry}
          />
          <CursorPagination {...view.pagination} />
        </Panel>
      )}
      <MoadianTransmissionForm view={view} />
      <Dialog
        title="ارسال دوباره به مؤدیان"
        open={!!view.retryTarget}
        onOpenChange={(open) => {
          if (!open) view.confirmRetry();
        }}
        footer={<Button busy={view.rowCommand.busy} onClick={view.retry}>تأیید ارسال دوباره</Button>}
      >
        {view.retryTarget && (
          <p className="text-sm">
            صورتحساب فاکتور <bdi>{view.retryTarget.invoice_reference}</bdi> با همان شناسه دوباره ارسال می‌شود.
          </p>
        )}
        <FormMessage error>{view.rowCommand.error?.message}</FormMessage>
      </Dialog>
    </>
  );
}
