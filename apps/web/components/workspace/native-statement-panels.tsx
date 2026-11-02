"use client";
import { Button } from "@/components/ui/button";
import { CursorPagination, Pagination } from "@/components/ui/pagination";
import {
  ErrorState,
  LoadingState,
  EmptyState,
} from "@/components/ui/content-states";
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
import type { useNativeStatements } from "@/hooks/use-native-statements";
import type { useOpeningEvidence } from "@/hooks/use-opening-evidence";
import { amount, displayDate } from "@/lib/utils";
import { Panel } from "./page-parts";
type Controller = ReturnType<typeof useNativeStatements>;
type OpeningController = ReturnType<typeof useOpeningEvidence>;

export function NativeStatementDetails({ c }: { c: Controller }) {
  return (
    <Panel title={c.run ? "جزئیات نسخه ثابت" : "جزئیات دفتر جاری"}>
      <p className="mb-4 text-sm text-muted">
        فقط اسناد نهایی دیدبان؛ فایل‌های دفتر خارجی در این گزارش جمع نمی‌شوند.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>حساب / طرف</TableHead>
            <TableHead>گردش دوره (ریال)</TableHead>
            <TableHead>مانده (ریال)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {c.rows.length ? (
            c.rows.map((row) => (
              <TableRow key={`${row.account_id}:${row.party_id}`}>
                <TableRowHeader>
                  {row.code} · {row.name}
                  <span className="block text-xs text-muted">
                    {row.party_id}
                  </span>
                </TableRowHeader>
                <TableCell>{amount(row.period_movement)}</TableCell>
                <TableCell>{amount(row.cumulative_balance)}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableEmptyCell
              colSpan={3}
              title="سند نهایی در این دوره موجود نیست"
            />
          )}
        </TableBody>
      </Table>
      <Pagination
        page={c.page}
        total={c.total}
        onPrevious={() => c.setPage(c.page - 1)}
        onNext={() => c.setPage(c.page + 1)}
      />
    </Panel>
  );
}

export function NativeOpeningPanel({
  c,
  opening,
}: {
  c: Controller;
  opening: OpeningController;
}) {
  return (
    <Panel title="مبنای افتتاحیه" className="mt-5">
      {opening.canDeclare && !c.run && (
        <Button
          variant="secondary"
          disabled={!c.period}
          onClick={() => opening.openZero(c.period)}
        >
          اعلام مانده اولیه صفر
        </Button>
      )}
      {opening.history.loading ? (
        <LoadingState variant="message" />
      ) : opening.history.error ? (
        <ErrorState
          message={opening.history.error.message}
          onRetry={opening.history.refresh}
        />
      ) : (
        <ul className="mt-4 space-y-3">
          {opening.history.data?.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-border p-4"
            >
              <span>
                {item.revoked ? "اعلام صفر لغوشده" : "اعلام صفر"} ·{" "}
                {item.reason}
              </span>
              {opening.canDeclare && !item.revoked && (
                <Button
                  variant="secondary"
                  onClick={() => opening.openRevoke(item.id)}
                >
                  لغو با دلیل
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <CursorPagination {...opening.history} />
    </Panel>
  );
}

export function NativeStatementHistory({ c }: { c: Controller }) {
  return (
    <Panel title="نسخه‌های ذخیره‌شده" className="mt-5">
      {c.history.loading ? (
        <LoadingState />
      ) : c.history.error ? (
        <ErrorState
          message={c.history.error.message}
          onRetry={c.history.refresh}
        />
      ) : (
        <>
          {!c.history.data?.items.length && (
            <EmptyState compact title="صورت مالی ذخیره نشده" />
          )}
          <div className="flex flex-wrap gap-2">
            {c.history.data?.items.map((item) => (
              <Button
                key={item.id}
                variant="secondary"
                disabled={c.command.busy}
                onClick={() => c.selectRun(item)}
              >
                {item.snapshot.period?.name || "صورت مالی"} ·{" "}
                {displayDate(item.snapshot.as_of)}
              </Button>
            ))}
          </div>
          <CursorPagination {...c.history} />
        </>
      )}
    </Panel>
  );
}
