"use client";
import { Drawer } from "@/components/ui/drawer";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableRowHeader,
} from "@/components/ui/table";
import { TruncatedText } from "@/components/ui/tooltip";
import type { NativeControlsController } from "@/hooks/use-native-controls";
import { displayDate, persian } from "@/lib/utils";
import { DocumentDiscussionButton } from "./document-discussion-button";
export function NativeControlEvidence({ c }: { c: NativeControlsController }) {
  return (
    <Drawer
      title={c.evidence?.title || "شواهد دفتر اصلی"}
      open={!!c.evidence}
      onOpenChange={(open) => {
        if (!open) c.closeEvidence();
      }}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>سند</TableHead>
            <TableHead>تاریخ</TableHead>
            <TableHead>نسخه تأییدشده</TableHead>
            <TableHead>اثر انگشت سند</TableHead>
            <TableHead>رسیدگی</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {c.evidenceRows.map((row) => (
            <TableRow key={row.journal_id}>
              <TableRowHeader>{persian(row.sequence)}</TableRowHeader>
              <TableCell>{displayDate(row.date)}</TableCell>
              <TableCell>{persian(row.approved_draft_version)}</TableCell>
              <TableCell>
                <TruncatedText className="max-w-40 font-mono text-xs">
                  {row.digest}
                </TruncatedText>
              </TableCell>
              <TableCell>
                <DocumentDiscussionButton
                  subjectKind="journal"
                  subjectId={row.journal_id}
                  label="گفت‌وگو و پیگیری"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        page={c.evidence?.page || 0}
        total={c.evidence?.refs.length || 0}
        onPrevious={() => c.pageEvidence(-1)}
        onNext={() => c.pageEvidence(1)}
      />
    </Drawer>
  );
}
