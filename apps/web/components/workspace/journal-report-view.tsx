"use client";

import { useState } from "react";
import { BooksIcon } from "@phosphor-icons/react";
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
import { useJournalReport } from "@/hooks/use-journal-report";
import type { NativeJournal } from "@/hooks/use-native-journals";
import { useWorkspace } from "@/hooks/workspace";
import { amount, displayDate, persian } from "@/lib/utils";
import { NoCompany, PageHeader, Panel } from "./page-parts";

export function JournalReportView() {
  const { company, periodId, user } = useWorkspace();
  return company
    ? <JournalReport key={`${user?.id}:${company.id}:${periodId}`} />
    : <NoCompany />;
}

function JournalReport() {
  const journals = useJournalReport();
  const [selected, setSelected] = useState<NativeJournal | null>(null);

  return (
    <>
      <PageHeader title="دفتر روزنامه" icon={BooksIcon} />
      <Panel title="ثبت‌های قطعی">
        {journals.loading ? (
          <LoadingState label="در حال دریافت ثبت‌های قطعی" variant="table" />
        ) : journals.error ? (
          <ErrorState message={journals.error.message} onRetry={journals.refresh} />
        ) : (
          <>
            <Table>
              <TableHeader sticky>
                <TableRow>
                  <TableHead>شماره سند</TableHead>
                  <TableHead>تاریخ ثبت</TableHead>
                  <TableHead>شرح</TableHead>
                  <TableHead><span className="sr-only">جزئیات</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journals.data?.items.length ? journals.data.items.map((journal) => (
                  <TableRow key={journal.id}>
                    <TableRowHeader>{persian(journal.sequence)}</TableRowHeader>
                    <TableCell>{displayDate(journal.date)}</TableCell>
                    <TableCell>{journal.snapshot.description}</TableCell>
                    <TableCell>
                      <Button variant="secondary" onClick={() => setSelected(journal)}>
                        جزئیات<span className="sr-only"> سند {persian(journal.sequence)}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableEmptyCell colSpan={4} title="ثبت قطعی در این بازه وجود ندارد" />
                )}
              </TableBody>
            </Table>
            <CursorPagination {...journals} />
          </>
        )}
      </Panel>
      <Drawer
        title={selected ? `جزئیات سند ${persian(selected.sequence)}` : "جزئیات سند"}
        open={!!selected}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
      >
        {selected && <JournalLines journal={selected} />}
      </Drawer>
    </>
  );
}

function JournalLines({ journal }: { journal: NativeJournal }) {
  return (
    <div className="space-y-4">
      <p>{journal.snapshot.description}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>حساب</TableHead>
            <TableHead numeric>بدهکار (ریال)</TableHead>
            <TableHead numeric>بستانکار (ریال)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {journal.snapshot.lines.map((line, index) => (
            <TableRow key={index}>
              <TableRowHeader>{line.code} · {line.name}</TableRowHeader>
              <TableCell numeric>{amount(line.debit)}</TableCell>
              <TableCell numeric>{amount(line.credit)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
