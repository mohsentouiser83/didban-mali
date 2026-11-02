"use client";
import { useGroupMatches, type GroupMatch } from "@/hooks/use-group-matches";
import { Panel } from "./page-parts";
import { EvidenceList } from "./evidence-list";
import {
  Table, TableHeader, TableHead, TableRow, TableBody, TableCell, TableRowHeader, TableEmptyCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormMessage } from "@/components/ui/field";
import { Form } from "@/components/ui/form";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui/content-states";
import { StatusBadge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { amount, persian } from "@/lib/utils";
import { ManualGroupMatches } from "./manual-group-matches";

type GroupView = ReturnType<typeof useGroupMatches>;

function GroupRows({ rows, onOpen }: { rows: GroupMatch[]; onOpen: (item: GroupMatch) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>مرجع</TableHead>
          <TableHead>بانک / دفتر</TableHead>
          <TableHead>جمع بانک (ریال)</TableHead>
          <TableHead>اختلاف (ریال)</TableHead>
          <TableHead>وضعیت</TableHead>
          <TableHead>شواهد</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length ? rows.map(row => (
          <TableRow key={row.id}>
            <TableRowHeader>{row.reference}</TableRowHeader>
            <TableCell>{persian(row.bank_ids.length)} / {persian(row.ledger_ids.length)}</TableCell>
            <TableCell>{amount(row.bank_total)}</TableCell>
            <TableCell>{amount(row.difference)}</TableCell>
            <TableCell><StatusBadge status={row.status} /></TableCell>
            <TableCell><Button variant="secondary" onClick={() => onOpen(row)}>بررسی گروه</Button></TableCell>
          </TableRow>
        )) : <TableEmptyCell colSpan={6} title="گروه چندگردشی برای بررسی موجود نیست" />}
      </TableBody>
    </Table>
  );
}

function GroupSummary({ item }: { item: GroupMatch }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-4">
        <div><dt>جمع بانک (ریال)</dt><dd>{amount(item.bank_total)}</dd></div>
        <div><dt>جمع دفتر (ریال)</dt><dd>{amount(item.ledger_total)}</dd></div>
      </dl>
      {item.dates.length > 1 && <StatusMessage>تاریخ ثبت‌های این گروه یکسان نیست.</StatusMessage>}
      {item.reason_codes.includes("shared_reference_missing") && (
        <StatusMessage>مرجع مشترک ندارند؛ برابری جمع روز، ارتباط تراکنش‌ها را ثابت نمی‌کند.</StatusMessage>
      )}
      <EvidenceList evidence={item.evidence_refs} />
    </>
  );
}

function GroupDecisionForm({ view }: { view: GroupView }) {
  return (
    <Form fieldErrors={view.command.error?.fields} onSubmit={event => { event.preventDefault(); void view.submit(); }}>
      <Field id="group-decision" label="تصمیم">
        <Select id="group-decision" value={view.decision} onValueChange={view.setDecision}
          options={view.options} disabled={view.command.busy} />
      </Field>
      <Field id="group-reason" label="دلیل">
        <Textarea id="group-reason" required maxLength={500} value={view.reason}
          onChange={event => view.setReason(event.target.value)} disabled={view.command.busy} />
      </Field>
      <FormMessage error>{view.command.error?.message}</FormMessage>
      {view.newerVersionAvailable ? (
        <Button variant="secondary" onClick={view.adoptLatest}>استفاده از نسخهٔ تازه</Button>
      ) : view.command.error?.code === "version_conflict" && (
        <Button variant="secondary" onClick={view.resource.refresh}>بازخوانی گروه‌ها</Button>
      )}
      <Button type="submit" busy={view.command.busy} disabled={!view.canSubmit}>ثبت تصمیم</Button>
    </Form>
  );
}

export function GroupMatchesPanel({ runId, onDecided }: { runId: string; onDecided?: () => void }) {
  const view = useGroupMatches(runId, onDecided);
  return (
    <Panel title="تطبیق گروهی" className="mt-5">
      {view.resource.loading ? <LoadingState label="در حال دریافت گروه‌های تطبیق" /> : view.resource.error ? (
        <ErrorState message={view.resource.error.message} onRetry={view.resource.refresh} />
      ) : <GroupRows rows={view.rows} onOpen={view.open} />}
      <Pagination page={view.page} total={view.total} onPrevious={view.previous} onNext={view.next} />
      <ManualGroupMatches runId={runId} onDecided={() => {
        view.resource.refresh();
        onDecided?.();
      }} />
      <Drawer open={!!view.selected} onOpenChange={open => { if (!open) view.close(); }} title="شواهد تطبیق گروهی">
        {view.selected && (
          <div className="space-y-5">
            <GroupSummary item={view.selected} />
            {view.workspace.canWrite && <GroupDecisionForm view={view} />}
          </div>
        )}
      </Drawer>
    </Panel>
  );
}
