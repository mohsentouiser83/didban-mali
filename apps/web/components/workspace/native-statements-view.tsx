"use client";
import { ChartLineUpIcon } from "@phosphor-icons/react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PersianDatePicker } from "@/components/ui/persian-date-picker";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { StatCards } from "@/components/ui/financial/stat-cards";
import { LoadingState, ErrorState } from "@/components/ui/content-states";
import { useOpeningEvidence } from "@/hooks/use-opening-evidence";
import { OpeningEvidenceDialog } from "./opening-evidence-dialog";
import { useNativeStatements } from "@/hooks/use-native-statements";
import { useWorkspace } from "@/hooks/workspace";
import { displayDate } from "@/lib/utils";
import {
  NativeStatementDetails,
  NativeOpeningPanel,
  NativeStatementHistory,
} from "./native-statement-panels";
import { PageHeader, Panel, NoCompany } from "./page-parts";
export function NativeStatementsView() {
  const w = useWorkspace();
  return w.company ? (
    <Workspace key={`${w.user?.id}:${w.company.id}`} />
  ) : (
    <NoCompany />
  );
}
function Workspace() {
  const c = useNativeStatements();
  const opening = useOpeningEvidence(c.preview.refresh);
  return (
    <>
      <PageHeader
        title="صورت مالی دفتر دیدبان"
        icon={ChartLineUpIcon}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/settings/account-roles" variant="secondary">
              نقش حساب‌ها
            </ButtonLink>
            <ButtonLink href="/accounting/journals" variant="secondary">
              دفتر اصلی
            </ButtonLink>
          </div>
        }
      />
      <Panel>
        <div className="flex flex-wrap items-end gap-3">
          <Field id="statement-period" label="دوره">
            <Select
              id="statement-period"
              disabled={c.command.busy}
              value={c.period}
              onValueChange={c.setPeriod}
              options={c.workspace.periods.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
            />
          </Field>
          <Field id="statement-as-of" label="تاریخ مبنا">
            <PersianDatePicker
              id="statement-as-of"
              value={c.asOf}
              onChange={c.setAsOf}
              disabled={!c.period || c.command.busy}
            />
          </Field>
          {c.workspace.canWrite && (
            <Button
              disabled={
                !c.period || !c.asOf || c.preview.loading || !!c.preview.error
              }
              busy={c.command.busy}
              onClick={c.save}
            >
              ذخیره نسخه ثابت
            </Button>
          )}
          {c.run?.can_approve && (
            <Button busy={c.command.busy} onClick={() => c.setApproving(true)}>
              تأیید این نسخه
            </Button>
          )}
          {c.run && (
            <Button
              variant="secondary"
              disabled={c.command.busy}
              onClick={c.showLive}
            >
              نمای جاری
            </Button>
          )}
          {c.downloadBase && (
            <>
              <ButtonLink
                href={c.downloadBase + "?format=pdf"}
                variant="secondary"
              >
                PDF
              </ButtonLink>
              <ButtonLink
                href={c.downloadBase + "?format=xlsx"}
                variant="secondary"
              >
                Excel
              </ButtonLink>
            </>
          )}
        </div>
        <FormMessage error>{c.command.error?.message}</FormMessage>
        {c.run?.approvals?.map((item) => (
          <p key={item.id} className="mt-3 text-sm text-muted">
            تأیید {item.actor_name} · {displayDate(item.created_at)}
          </p>
        ))}
      </Panel>
      {!c.run && c.preview.loading ? (
        <LoadingState />
      ) : !c.run && c.preview.error ? (
        <ErrorState
          message={c.preview.error.message}
          onRetry={c.preview.refresh}
        />
      ) : (
        c.statement && (
          <div className="mt-5 space-y-5">
            <StatCards
              showComparison={false}
              metrics={c.metrics}
              items={c.metrics.map((metric) => ({
                key: metric.metric_key,
                label: metric.label || metric.metric_key,
              }))}
            />
            <NativeStatementDetails c={c} />
          </div>
        )
      )}
      <NativeOpeningPanel c={c} opening={opening} />
      <OpeningEvidenceDialog c={opening} />
      <ConfirmDialog
        title="تأیید نسخه ثابت صورت مالی"
        open={c.approving}
        onOpenChange={c.setApproving}
        busy={c.command.busy}
        onConfirm={c.approve}
      >
        <p>همین نسخه با مبنا و محدودیت‌های نمایش‌داده‌شده تأیید می‌شود.</p>
        <FormMessage error>{c.command.error?.message}</FormMessage>
      </ConfirmDialog>
      <NativeStatementHistory c={c} />
    </>
  );
}
