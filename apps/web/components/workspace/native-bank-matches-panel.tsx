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
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
  TableEmptyCell,
} from "@/components/ui/table";
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
import { amount, persian, displayDate } from "@/lib/utils";
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
        <div className="space-y-3">
          <EmptyState
            title="نسخهٔ ثابت دفتر دیدبان موجود نیست"
            description="برای تطبیق حساب بانکی، ابتدا یک نسخهٔ ثابت از صورت‌های دفتر بومی تولید کنید."
          />
          <div className="flex justify-center">
            <ButtonLink variant="secondary" href="/reports/native">
              تولید نسخهٔ ثابت دفتر دیدبان
            </ButtonLink>
          </div>
        </div>
      ) : (
        <>
          <Field id="native-bank-statement" label="نسخهٔ دفتر دیدبان" required>
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
            <div className="space-y-3">
              <EmptyState
                title="گردش بانکی برای تطبیق موجود نیست"
                description="ابتدا فایل صورتحساب بانکی را بارگذاری کنید تا گردش‌های باز در دسترس تطبیق قرار گیرند."
              />
              <div className="flex justify-center">
                <ButtonLink variant="secondary" href="/settings/documents">
                  بارگذاری صورتحساب بانکی در مدارک
                </ButtonLink>
              </div>
            </div>
          ) : (
            view.current.statementId && (
              <div className="space-y-5">
                {!view.ledgerAccountChoices.length ? (
                  <div className="space-y-2">
                    <StatusMessage>
                      این نسخه ردیف حساب بانکی ندارد؛ نقش حساب‌ها و گزارش را بررسی
                      کنید.
                    </StatusMessage>
                    <ButtonLink variant="secondary" href="/settings/accounts">
                      بررسی کدینگ و نقش حساب‌های بانکی
                    </ButtonLink>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        id="native-match-bank-account"
                        label="حساب گردش بانک"
                        required
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
                        required
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
          <EmptyState
            compact
            title="تطبیقی ذخیره نشده"
            description="برای تطبیق گردش‌های بانکی واردشده با حساب بانک در دفتر دیدبان، روی «تطبیق جدید» بزنید."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>دوره و مبنا</TableHead>
                <TableHead>حساب بانک</TableHead>
                <TableHead>حساب دفتر</TableHead>
                <TableHead>تعداد ردیف‌ها</TableHead>
                <TableHead numeric>جمع مبلغ (ریال)</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.historyRows.length ? view.historyRows.map((item) => (
                <TableRow key={item.id}>
                  <TableRowHeader>
                    <span>{item.snapshot.statement_period?.name || "دوره جاری"}</span>
                    <div className="text-xs text-muted">
                      تا {displayDate(item.snapshot.statement_as_of)} · دفتر بومی
                    </div>
                  </TableRowHeader>
                  <TableCell dir="ltr" className="font-mono text-xs">{item.snapshot.bank_account}</TableCell>
                  <TableCell dir="ltr" className="font-mono text-xs">{item.snapshot.ledger_account}</TableCell>
                  <TableCell className="tabular-nums text-xs">
                    {persian(item.snapshot.bank_ids.length)} بانک / {persian(item.snapshot.ledger_ids.length)} دفتر
                  </TableCell>
                  <TableCell className="tabular-nums">{amount(item.snapshot.bank_total)}</TableCell>
                  <TableCell><StatusBadge status={item.status} /></TableCell>
                  <TableCell>
                    <Button
                      variant="secondary"
                      disabled={view.command.busy}
                      onClick={() => {
                        view.view(item);
                        setMode("details");
                      }}
                    >
                      مشاهده و تصمیم
                    </Button>
                  </TableCell>
                </TableRow>
              )) : <TableEmptyCell colSpan={7} title="تطبیقی ذخیره نشده" />}
            </TableBody>
          </Table>
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
