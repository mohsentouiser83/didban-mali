"use client";
import { useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { CursorPagination, Pagination } from "@/components/ui/pagination";
import { StatusBadge } from "@/components/ui/badge";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  StatusMessage,
} from "@/components/ui/content-states";
import {
  useNativeBankMatches,
  type NativeBankController,
} from "@/hooks/use-native-bank-matches";
import { persian, displayDate } from "@/lib/utils";
import { Panel } from "./page-parts";
import { GroupPreviewReview } from "./manual-group-matches";
import { ReconciliationSelectedRows } from "./reconciliation-selected-rows";

function Selection({
  view,
  side,
}: {
  view: NativeBankController;
  side: "bank" | "ledger";
}) {
  const bank = side === "bank";
  const options = bank ? view.bankOptions : view.ledgerOptions;
  const rows = bank ? view.current.banks : view.current.ledgers;
  const page = bank ? view.bankPage : view.ledgerPage;
  const account = bank ? view.current.bankAccount : view.current.ledgerAccount;
  const label = bank ? "گردش بانک واردشده" : "ردیف بانکی دفتر دیدبان";
  return (
    <section className="space-y-3">
      <h3 className="font-medium">
        {label} · {persian(rows.length)} انتخاب
      </h3>
      {view.workspace.canWrite && account && (
        <>
          <Field id={`native-match-${side}`} label={`افزودن ${label}`}>
            <SearchSelect
              id={`native-match-${side}`}
              value=""
              query={view.queries[side]}
              onQueryChange={(q) => view.queryChange(side, q)}
              onValueChange={(id) => view.add(side, id)}
              options={bank ? view.bankChoices : view.ledgerChoices}
              loading={options.loading}
              error={options.error?.message}
              hasMore={(options.data?.total || 0) > (page + 1) * 25}
              disabled={view.command.busy || rows.length >= 100}
              searchLabel={`جستجوی ${label}`}
            />
          </Field>
          <Pagination
            page={page}
            total={options.data?.total || 0}
            onPrevious={() => view.pageChange(side, page - 1)}
            onNext={() => view.pageChange(side, page + 1)}
          />
        </>
      )}
      <ReconciliationSelectedRows
        rows={rows}
        canRemove={view.workspace.canWrite}
        busy={view.command.busy}
        onRemove={(id) => view.remove(side, id)}
      />
    </section>
  );
}
function NativeMatchSelection({ view }: { view: NativeBankController }) {
  return (
    <section className="space-y-5">
      {view.statements.loading ? (
        <LoadingState label="در حال دریافت نسخه‌های دفتر دیدبان" />
      ) : view.statements.error ? (
        <ErrorState
          message={view.statements.error.message}
          onRetry={view.statements.refresh}
        />
      ) : !view.statementChoices.length ? (
        <EmptyState
          title="نسخهٔ ثابت دفتر دیدبان موجود نیست"
          action={
            <ButtonLink href="/reports/native">ساخت نسخهٔ گزارش</ButtonLink>
          }
        />
      ) : (
        <>
          <Field id="native-bank-statement" label="نسخهٔ دفتر دیدبان">
            <Select
              id="native-bank-statement"
              value={view.current.statementId}
              onValueChange={view.selectStatement}
              options={view.statementChoices}
              disabled={view.command.busy}
            />
          </Field>
          <CursorPagination {...view.statements} />
          {view.sources.loading ? (
            <LoadingState label="در حال بررسی مبنای بانک و دفتر" />
          ) : view.sources.error ? (
            <ErrorState
              message={view.sources.error.message}
              onRetry={view.sources.refresh}
            />
          ) : !view.sources.data?.bank_accounts.length ? (
            <EmptyState
              title="گردش بانکی برای تطبیق موجود نیست"
              action={<ButtonLink href="/uploads">ورود گردش بانک</ButtonLink>}
            />
          ) : (
            view.current.statementId && (
              <div className="space-y-5">
                {!view.ledgerAccountChoices.length ? (
                  <StatusMessage>
                    این نسخه ردیف حساب بانکی ندارد؛ نقش حساب‌ها و گزارش را بررسی
                    کنید.
                  </StatusMessage>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        id="native-match-bank-account"
                        label="حساب گردش بانک"
                      >
                        <Select
                          id="native-match-bank-account"
                          value={view.current.bankAccount}
                          onValueChange={(value) =>
                            view.selectAccount("bank", value)
                          }
                          options={view.bankAccountChoices}
                          disabled={view.command.busy}
                        />
                      </Field>
                      <Field
                        id="native-match-ledger-account"
                        label="حساب متناظر در دفتر دیدبان"
                      >
                        <Select
                          id="native-match-ledger-account"
                          value={view.current.ledgerAccount}
                          onValueChange={(value) =>
                            view.selectAccount("ledger", value)
                          }
                          options={view.ledgerAccountChoices}
                          disabled={view.command.busy}
                        />
                      </Field>
                    </div>
                    <Selection view={view} side="bank" />
                    <Selection view={view} side="ledger" />
                    {view.workspace.canWrite && (
                      <Button
                        onClick={view.preview}
                        disabled={!view.canPreview}
                        busy={view.command.busy}
                      >
                        ساخت پیش‌نمایش همین انتخاب‌ها
                      </Button>
                    )}
                  </>
                )}
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}

export function NativeBankMatchesPanel() {
  const view = useNativeBankMatches();
  const [mode, setMode] = useState<"new" | "details" | null>(null);
  return (
    <>
      <Panel
        title="تطبیق‌های دفتر دیدبان"
        action={
          view.workspace.canWrite && (
            <Button
              disabled={view.command.busy}
              onClick={() => {
                view.startNew();
                setMode("new");
              }}
            >
              تطبیق جدید
            </Button>
          )
        }
      >
        {view.history.loading ? (
          <LoadingState label="در حال دریافت تطبیق‌های دفتر دیدبان" />
        ) : view.history.error ? (
          <ErrorState
            message={view.history.error.message}
            onRetry={view.history.refresh}
          />
        ) : !view.historyRows.length ? (
          <EmptyState compact title="تطبیقی ذخیره نشده" />
        ) : (
          <ul className="divide-y divide-border">
            {view.historyRows.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span>{item.label}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.status} />
                  <Button
                    variant="secondary"
                    disabled={view.command.busy}
                    onClick={() => {
                      view.view(item);
                      setMode("details");
                    }}
                  >
                    مشاهده
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <CursorPagination {...view.history} />
      </Panel>
      <Drawer
        title={
          mode === "new"
            ? "تطبیق جدید با دفتر دیدبان"
            : "جزئیات تطبیق با دفتر دیدبان"
        }
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open && !view.command.busy) setMode(null);
        }}
        className="sm:max-w-4xl"
      >
        <div className="space-y-5">
          {mode === "new" && <NativeMatchSelection view={view} />}
          {mode === "details" && view.command.busy && !view.current.preview && (
            <LoadingState label="در حال دریافت تطبیق" />
          )}
          {!view.current.preview && (
            <FormMessage error>{view.command.error?.message}</FormMessage>
          )}
          {view.current.preview && (
            <>
              <p className="text-sm text-muted">
                دفتر دیدبان تا{" "}
                {displayDate(view.current.preview.snapshot.statement_as_of)} ·
                گردش بانک واردشده
              </p>
              <GroupPreviewReview
                key={view.current.preview.id}
                view={view}
                ledgerLabel="جمع دفتر دیدبان (ریال)"
                bookProofHref={view.bookProofHref}
                evidenceRefs={view.bankEvidenceRefs}
              />
              {mode === "details" && view.workspace.canWrite && (
                <Button
                  variant="secondary"
                  disabled={view.command.busy}
                  onClick={() => setMode("new")}
                >
                  تنظیم انتخاب‌ها برای تطبیق تازه
                </Button>
              )}
            </>
          )}
        </div>
      </Drawer>
    </>
  );
}
